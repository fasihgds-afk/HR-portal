// app/api/hr/daily-attendance/route.js
// Request/response flow only; logic delegated to attendance/ modules.

import mongoose from 'mongoose';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Shift from '../../../../models/Shift';

import { getNextDateStr, classifyByTime } from './attendance/time-utils.js';
import { resolveCheckIn } from './attendance/checkin-resolver.js';
import { resolveCheckOut } from './attendance/checkout-resolver.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Normalize empCode to string for Map keys (device may send number). */
function toEmpCodeKey(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

/**
 * Extract shift code from emp.shift / emp.shiftId (string, ObjectId, or formatted).
 * Uses shiftById map built from active shifts.
 */
function extractShiftCode(shiftValue, shiftById) {
  if (!shiftValue) return '';
  const stringValue = String(shiftValue).trim();
  if (!stringValue) return '';
  if (/^[0-9a-fA-F]{24}$/.test(stringValue)) {
    const shiftCode = shiftById.get(stringValue);
    return shiftCode || '';
  }
  const directMatch = stringValue.match(/^([A-Z]\d+)$/i);
  if (directMatch) return directMatch[1].toUpperCase();
  const formattedMatch = stringValue.match(/^([A-Z]\d+)/i);
  if (formattedMatch) return formattedMatch[1].toUpperCase();
  if (/^[A-Z]\d+$/.test(stringValue)) return stringValue;
  return stringValue.toUpperCase();
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date) {
      throw new ValidationError('Missing "date" query parameter');
    }

    await connectDB();

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';
    const nextDateStr = getNextDateStr(date);

    const allShifts = await Shift.find({ isActive: true })
      .select('_id name code startTime endTime crossesMidnight gracePeriod')
      .lean()
      .maxTimeMS(2000);

    if (allShifts.length === 0) {
      throw new ValidationError('No active shifts found. Please create shifts first.');
    }

    const [allEmployees, existingRecords, nextDayRecords] = await Promise.all([
      Employee.find()
        .select('empCode name shift shiftId department designation')
        .lean()
        .maxTimeMS(2000),
      ShiftAttendance.find({ date })
        .select('date empCode checkIn checkOut shift attendanceStatus')
        .lean()
        .maxTimeMS(2000),
      ShiftAttendance.find({ date: nextDateStr })
        .select('date empCode checkIn checkOut shift')
        .lean()
        .maxTimeMS(2000),
    ]);

    const shiftByCode = new Map();
    const shiftById = new Map();
    for (const shift of allShifts) {
      shiftByCode.set(shift.code, shift);
      if (shift._id) {
        shiftById.set(shift._id.toString(), shift.code);
        shiftById.set(String(shift._id), shift.code);
      }
    }

    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      const empKey = toEmpCodeKey(emp.empCode);
      if (!empKey) continue;
      const employeeShift = extractShiftCode(emp.shift, shiftById) || extractShiftCode(emp.shiftId != null ? String(emp.shiftId) : '', shiftById);
      empInfoMap.set(empKey, {
        name: emp.name || '',
        shift: employeeShift,
        department: emp.department || '',
        designation: emp.designation || '',
      });
    }

    const startLocal = new Date(`${date}T09:00:00${TZ}`);
    const endLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);

    const nextDayByEmpCode = new Map();
    for (const record of nextDayRecords) {
      const key = toEmpCodeKey(record.empCode);
      if (key) nextDayByEmpCode.set(key, record);
    }

    const existingByEmpCode = new Map();
    for (const record of existingRecords) {
      const key = toEmpCodeKey(record.empCode);
      if (!key) continue;
      const existing = existingByEmpCode.get(key);
      if (!existing || (!existing.checkOut && record.checkOut)) {
        existingByEmpCode.set(key, record);
      }
    }

    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38,
    })
      .select('eventTime empCode')
      .sort({ eventTime: 1 })
      .lean()
      .maxTimeMS(4000);

    const nextDayStartLocal = new Date(`${nextDateStr}T00:00:00${TZ}`);
    const nextDayEndLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);
    const nightShiftEmpCodes = new Set();
    for (const emp of allEmployees) {
      const empKey = toEmpCodeKey(emp.empCode);
      if (!empKey) continue;
      const empAssignedShift = extractShiftCode(emp.shift, shiftById) || extractShiftCode(emp.shiftId != null ? String(emp.shiftId) : '', shiftById);
      const shiftObj = shiftByCode.get(empAssignedShift);
      if (shiftObj?.crossesMidnight === true) nightShiftEmpCodes.add(empKey);
    }
    const nightShiftEmpCodesForQuery = new Set(nightShiftEmpCodes);
    for (const code of nightShiftEmpCodes) {
      const num = Number(code);
      if (!Number.isNaN(num)) nightShiftEmpCodesForQuery.add(num);
    }

    const allNextDayEvents =
      nightShiftEmpCodesForQuery.size > 0
        ? await AttendanceEvent.find({
            empCode: { $in: Array.from(nightShiftEmpCodesForQuery) },
            eventTime: { $gte: nextDayStartLocal, $lte: nextDayEndLocal },
            minor: 38,
          })
            .select('eventTime empCode')
            .sort({ empCode: 1, eventTime: 1 })
            .lean()
            .maxTimeMS(2500)
        : [];

    const nextDayEventsByEmp = new Map();
    for (const event of allNextDayEvents) {
      const key = toEmpCodeKey(event.empCode);
      if (!key) continue;
      if (!nextDayEventsByEmp.has(key)) nextDayEventsByEmp.set(key, []);
      nextDayEventsByEmp.get(key).push(event);
    }

    const byEmp = new Map();
    for (const ev of events) {
      const evKey = toEmpCodeKey(ev.empCode);
      if (!evKey) continue;
      const local = new Date(ev.eventTime);
      const timeShift = classifyByTime(local, date, TZ, allShifts);
      let rec = byEmp.get(evKey);
      if (!rec) {
        const info = empInfoMap.get(evKey) || {};
        rec = {
          empCode: evKey,
          employeeName: info.name || ev.employeeName || ev.raw?.name || '',
          assignedShift: info.shift || '',
          department: info.department || '',
          designation: info.designation || '',
          times: [],
          detectedShifts: new Set(),
        };
        byEmp.set(evKey, rec);
      }
      rec.times.push(local);
      if (timeShift) rec.detectedShifts.add(timeShift);
    }

    const items = [];

    for (const emp of allEmployees) {
      const empKey = toEmpCodeKey(emp.empCode);
      const rec = byEmp.get(empKey);
      const existingRecord = existingByEmpCode.get(empKey);
      const times = rec?.times ? [...rec.times].sort((a, b) => a - b) : [];

      const empAssignedShift = extractShiftCode(
        rec?.assignedShift || emp.shift || (emp.shiftId != null ? String(emp.shiftId) : ''),
        shiftById
      );
      const shiftObjForCheckOut = shiftByCode.get(empAssignedShift);
      const isNightShiftForCheckOut = shiftObjForCheckOut?.crossesMidnight === true;

      const { checkIn } = resolveCheckIn({
        empKey,
        times,
        existingRecord,
        nextDayByEmpCode,
        nextDayEventsByEmp,
        nextDateStr,
        TZ,
        shiftObjForCheckOut,
        isNightShiftForCheckOut,
      });

      const checkOut = resolveCheckOut({
        empKey,
        emp,
        times,
        checkIn,
        existingRecord,
        nextDayByEmpCode,
        nextDayEventsByEmp,
        date,
        nextDateStr,
        TZ,
        shiftByCode,
        empAssignedShift,
        isNightShiftForCheckOut,
      });

      const empShiftRaw = emp.shift || (emp.shiftId != null ? String(emp.shiftId) : '');
      let assignedShift = extractShiftCode(empShiftRaw, shiftById);
      if (!assignedShift && rec?.assignedShift) assignedShift = extractShiftCode(rec.assignedShift, shiftById);

      let shift = 'Unknown';
      if (assignedShift) shift = assignedShift;
      else if (rec?.detectedShifts?.size > 0) shift = Array.from(rec.detectedShifts)[0];

      let totalPunches = times.length;
      if (totalPunches === 0 && (existingRecord?.checkIn || checkIn)) {
        totalPunches = checkOut ? 2 : checkIn ? 1 : 0;
      } else if (totalPunches === 1 && checkOut && times.length === 1) {
        totalPunches = 2;
      }
      const attendanceStatus = totalPunches > 0 ? 'Present' : 'Absent';

      items.push({
        empCode: emp.empCode,
        employeeName: emp.name || rec?.employeeName || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift,
        checkIn,
        checkOut,
        totalPunches,
        attendanceStatus,
      });
    }

    const presentItems = items.filter((item) => item.totalPunches > 0);
    const bulkOps = presentItems.map((item) => ({
      updateOne: {
        filter: { date, empCode: item.empCode, shift: item.shift },
        update: {
          $set: {
            date,
            empCode: item.empCode,
            employeeName: item.employeeName,
            department: item.department || '',
            designation: item.designation || '',
            shift: item.shift,
            checkIn: item.checkIn,
            checkOut: item.checkOut || null,
            totalPunches: item.totalPunches,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await ShiftAttendance.bulkWrite(bulkOps, { ordered: false, maxTimeMS: 5000, session });
        });
      } finally {
        await session.endSession();
      }
    }

    const shiftOrder = new Map();
    allShifts.forEach((s, idx) => shiftOrder.set(s.code, idx + 1));
    shiftOrder.set('Unknown', 999);
    items.sort((a, b) => {
      const sa = shiftOrder.get(a.shift) ?? 999;
      const sb = shiftOrder.get(b.shift) ?? 999;
      if (sa !== sb) return sa - sb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return successResponse(
      { date, savedCount: presentItems.length, items },
      'Daily attendance saved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
