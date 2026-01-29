// app/api/hr/departments/route.js
// List, create, and update departments (name + saturdayPolicy for weekend rules).
import { connectDB } from '../../../../lib/db';
import Department from '../../../../models/Department';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/hr/departments - List all departments (name, saturdayPolicy)
export async function GET() {
  try {
    await connectDB();
    const departments = await Department.find()
      .select('name saturdayPolicy')
      .sort({ name: 1 })
      .lean()
      .maxTimeMS(1500);
    return successResponse({ departments }, 'Departments retrieved', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err);
  }
}

// POST /api/hr/departments - Create department (name required, saturdayPolicy optional)
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) throw new ValidationError('name is required');
    const saturdayPolicy = body.saturdayPolicy === 'all_off' ? 'all_off' : 'alternate';
    const existing = await Department.findOne({ name }).lean().maxTimeMS(1500);
    if (existing) throw new ValidationError(`Department "${name}" already exists`);
    const doc = await Department.create({ name, saturdayPolicy });
    return successResponse(
      { department: { _id: doc._id, name: doc.name, saturdayPolicy: doc.saturdayPolicy } },
      'Department created',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// PATCH /api/hr/departments - Update saturdayPolicy by name
export async function PATCH(req) {
  try {
    await connectDB();
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) throw new ValidationError('name is required');
    const saturdayPolicy = body.saturdayPolicy === 'all_off' ? 'all_off' : 'alternate';
    const doc = await Department.findOneAndUpdate(
      { name },
      { $set: { saturdayPolicy } },
      { new: true, runValidators: true }
    )
      .select('name saturdayPolicy')
      .lean()
      .maxTimeMS(1500);
    if (!doc) throw new ValidationError(`Department "${name}" not found`);
    return successResponse({ department: doc }, 'Department updated', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
