# Attendance System Architecture & Logic

## 📁 File Structure Overview

```
next-app/
├── app/
│   ├── hr/
│   │   ├── page.jsx                    # Daily Attendance UI (Frontend)
│   │   └── monthly/
│   │       └── page.jsx                # Monthly Attendance UI (Frontend)
│   └── api/
│       └── hr/
│           ├── shift-attendance/
│           │   └── route.js            # Daily Attendance API (Backend)
│           └── monthly-attendance/
│               └── route.js            # Monthly Attendance API (Backend)
├── models/
│   ├── AttendanceEvent.js              # Raw punch events from device
│   ├── ShiftAttendance.js              # Daily attendance snapshots
│   ├── MonthlyAttendance.js            # Monthly attendance (optional cache)
│   ├── Employee.js                     # Employee master data
│   ├── Shift.js                        # Shift definitions
│   └── EmployeeShiftHistory.js         # Employee shift change history
└── lib/
    └── db.js                           # Database connection
```

---

## 📅 DAILY ATTENDANCE SYSTEM

### **Frontend: `next-app/app/hr/page.jsx`**

#### **Data Fetch Flow:**
```javascript
// 1. User clicks "Load & Save" button
handleLoadAndSave() {
  // 2. Makes POST request to API
  fetch(`/api/hr/shift-attendance?date=${businessDate}`, { method: 'POST' })
  
  // 3. Receives data.items array
  setRows(data.items || [])
}
```

#### **State Management:**
- `businessDate`: Selected date (YYYY-MM-DD)
- `rows`: Array of attendance records
- `searchQuery`: Search filter
- `selectedShift`: Shift filter
- `shifts`: Available shifts for filter dropdown

#### **Display Logic:**
1. **Filtering**: Combines shift filter + search query
2. **Grouping**: Groups by department with headers
3. **Sorting**: Department priority → Manager/TL first → Emp Code
4. **Stats**: Calculates Present/Absent counts, totals by shift

---

### **Backend: `next-app/app/api/hr/shift-attendance/route.js`**

#### **API Endpoint:**
```
POST /api/hr/shift-attendance?date=YYYY-MM-DD
```

#### **Step-by-Step Logic:**

**1. Load Employee Data**
```javascript
const allEmployees = await Employee.find().lean();
```

**2. Get Dynamic Shifts (from history)**
```javascript
// Pre-fetch shift history for the business date
const shiftHistoryForDate = await EmployeeShiftHistory.find({
  empCode: { $in: empCodes },
  effectiveDate: { $lte: date },
  $or: [{ endDate: null }, { endDate: { $gte: date } }]
})
```

**3. Define Time Window**
```javascript
// Business day window: [date 09:00] → [next day 06:00]
// This captures:
// - D1: 09:00-18:00 (same day)
// - D2: 15:00-24:00 (same day)
// - D3: 12:00-21:00 (same day)
// - S1: 18:00 (same day) → 03:00 (next day)
// - S2: 21:00 (same day) → 06:00 (next day)
const startLocal = new Date(`${date}T09:00:00${TZ}`);
const endLocal = new Date(`${date}T09:00:00${TZ}`);
endLocal.setDate(endLocal.getDate() + 1);
endLocal.setHours(8, 0, 0, 0);
```

**4. Fetch Raw Punch Events**
```javascript
const events = await AttendanceEvent.find({
  eventTime: { $gte: startLocal, $lte: endLocal },
  minor: 38  // Only "valid access" events
}).lean();
```

**5. Classify Events by Shift**
```javascript
// For each event, determine which shift window it belongs to
function classifyByTime(localDate, businessDateStr, tzOffset) {
  // Returns: 'D1', 'D2', 'D3', 'S1', 'S2', or null
}
```

**6. Group Punches by Employee**
```javascript
// Group all events by empCode
// Track: times[], hasD1, hasD2, hasD3, hasS1, hasS2
```

**7. Determine Final Shift**
```javascript
// Priority:
// 1. Employee's assigned shift (from history or Employee.shift)
// 2. Infer from punch times (if no assigned shift)
let shift = assignedShift || inferredFromPunches || 'Unknown';
```

**8. Calculate Check-In/Check-Out**
```javascript
const times = [...rec.times].sort((a, b) => a - b);
const checkIn = times[0] || null;
const checkOut = times.length > 1 ? times[times.length - 1] : null;
```

**9. Save to ShiftAttendance Collection**
```javascript
// Only save records for employees who have punches (Present)
await ShiftAttendance.bulkWrite(bulkOps);
```

**10. Return Response**
```javascript
return {
  date: "YYYY-MM-DD",
  savedCount: number,
  items: [
    {
      empCode: "12345",
      employeeName: "John Doe",
      department: "IT",
      designation: "Developer",
      shift: "D1",
      checkIn: Date,
      checkOut: Date,
      totalPunches: 2,
      attendanceStatus: "Present" | "Absent"
    },
    // ... more employees
  ]
}
```

---

### **Data Models Used:**

#### **1. AttendanceEvent** (Raw Device Data)
```javascript
{
  empCode: String,
  eventTime: Date,        // When punch happened
  minor: Number,          // 38 = valid access
  // ... other device fields
}
```

#### **2. ShiftAttendance** (Daily Snapshot)
```javascript
{
  date: "YYYY-MM-DD",
  empCode: String,
  employeeName: String,
  department: String,
  designation: String,
  shift: "D1" | "D2" | "D3" | "S1" | "S2",
  checkIn: Date,
  checkOut: Date,
  totalPunches: Number,
  attendanceStatus: String,
  late: Boolean,
  earlyLeave: Boolean,
  lateExcused: Boolean,
  earlyExcused: Boolean,
  reason: String
}
```

---

## 📊 MONTHLY ATTENDANCE SYSTEM

### **Frontend: `next-app/app/hr/monthly/page.jsx`**

#### **Data Fetch Flow:**
```javascript
// 1. Component mounts or month changes
useEffect(() => {
  loadMonth();
}, [month]);

// 2. Makes GET request to API
async function loadMonth() {
  const res = await fetch(`/api/hr/monthly-attendance?month=${month}`, {
    method: 'GET',
    cache: 'default'
  });
  
  // 3. Receives data object
  setData({
    month: "YYYY-MM",
    daysInMonth: 30,
    employees: [
      {
        empCode: "12345",
        name: "John Doe",
        shift: "D1",
        days: [
          { date: "2025-01-01", status: "Present", checkIn: Date, ... },
          { date: "2025-01-02", status: "Absent", ... },
          // ... 30 days
        ],
        lateCount: 3,
        earlyCount: 2,
        salaryDeductDays: 1.5,
        netSalary: 28000,
        // ... more fields
      }
    ]
  });
}
```

#### **State Management:**
- `month`: Selected month (YYYY-MM)
- `data`: Complete monthly data object
- `searchTerm`: Employee search filter
- `selectedShift`: Shift filter
- `modalOpen`: Edit day modal state

#### **Display Logic:**
1. **Table Structure**: Frozen columns (Emp Code, Name) + scrollable day columns
2. **Cell Colors**: Based on status, violations, excused flags
3. **Edit Modal**: Click any day cell to edit status, times, excused flags
4. **Export**: Excel export with configurable columns

---

### **Backend: `next-app/app/api/hr/monthly-attendance/route.js`**

#### **API Endpoint:**
```
GET /api/hr/monthly-attendance?month=YYYY-MM
```

#### **Step-by-Step Logic:**

**1. Parse Month & Calculate Days**
```javascript
const [yearStr, monthStr] = month.split('-');
const year = Number(yearStr);
const monthIndex = Number(monthStr) - 1;
const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
```

**2. Load All Employees**
```javascript
const employees = await Employee.find({}, {
  empCode: 1,
  name: 1,
  department: 1,
  designation: 1,
  shift: 1,
  shiftId: 1,
  monthlySalary: 1
}).lean();
```

**3. Load ShiftAttendance Records for Month**
```javascript
const shiftDocs = await ShiftAttendance.find({
  date: { $gte: `${monthPrefix}-01`, $lte: `${monthPrefix}-31` }
}).lean();

// Build map: "empCode|date" -> document
const docsByEmpDate = new Map();
```

**4. Pre-fetch Shift History (for dynamic shifts)**
```javascript
const allShiftHistory = await EmployeeShiftHistory.find({
  empCode: { $in: employees.map(e => e.empCode) },
  effectiveDate: { $lte: monthEndDate },
  $or: [{ endDate: null }, { endDate: { $gte: monthStartDate } }]
}).populate('shiftId').lean();
```

**5. Process Each Employee**
```javascript
for (const emp of employees) {
  const days = [];
  let lateCount = 0;
  let earlyCount = 0;
  let salaryDeductDays = 0;
  // ... more counters
  
  // 6. Process Each Day of Month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const doc = docsByEmpDate.get(`${emp.empCode}|${date}`);
    
    // 7. Get Dynamic Shift for This Date
    let shiftObj = getShiftForDate(emp, date, shiftHistoryMap);
    
    // 8. Determine Status
    let status = determineStatus(doc, isWeekendOff, isFutureDay);
    
    // 9. Calculate Late/Early Violations
    const { late, earlyLeave, lateMinutes, earlyMinutes } = 
      computeLateEarly(shiftObj, doc?.checkIn, doc?.checkOut);
    
    // 10. Calculate Salary Deductions
    // - Violation formula: Every 3rd violation = 1 full day
    // - Other violations = per-minute fine (minutes × 0.007)
    // - Absent days = 1 day each
    // - Unpaid leave = 1 day each
    // - Half days = 0.5 day each
    
    days.push({
      date,
      shift: shiftCode,
      status,
      checkIn: doc?.checkIn,
      checkOut: doc?.checkOut,
      late,
      earlyLeave,
      lateExcused: doc?.lateExcused,
      earlyExcused: doc?.earlyExcused,
      reason: doc?.reason
    });
  }
  
  // 11. Calculate Final Salary
  const grossSalary = emp.monthlySalary || 0;
  const perDaySalary = grossSalary / 30;
  const salaryDeductAmount = perDaySalary * salaryDeductDays;
  const netSalary = grossSalary - salaryDeductAmount;
  
  employeesOut.push({
    empCode: emp.empCode,
    name: emp.name,
    shift: dynamicShift,  // Most recent shift from history
    days: days,           // Array of 30/31 day objects
    lateCount,
    earlyCount,
    salaryDeductDays,
    monthlySalary: grossSalary,
    netSalary,
    salaryDeductAmount
  });
}
```

**12. Return Response**
```javascript
return {
  month: "YYYY-MM",
  daysInMonth: 30,
  employees: [
    {
      empCode: "12345",
      name: "John Doe",
      department: "IT",
      designation: "Developer",
      shift: "D1",
      monthlySalary: 30000,
      netSalary: 28000,
      salaryDeductDays: 1.5,
      lateCount: 3,
      earlyCount: 2,
      days: [
        {
          date: "2025-01-01",
          shift: "D1",
          status: "Present",
          checkIn: Date,
          checkOut: Date,
          late: false,
          earlyLeave: false,
          lateExcused: false,
          earlyExcused: false,
          reason: ""
        },
        // ... 30 days
      ]
    }
  ]
}
```

---

### **Key Functions in Monthly API:**

#### **1. `computeLateEarly(shift, checkIn, checkOut)`**
- Calculates if employee was late or left early
- Considers grace period (15 minutes default)
- Handles night shifts crossing midnight
- Returns: `{ late, earlyLeave, lateMinutes, earlyMinutes }`

#### **2. `getShiftForDate(emp, date, shiftHistoryMap)`**
- Looks up shift history for employee on specific date
- Returns shift object with startTime, endTime, gracePeriod
- Falls back to employee's current shift if no history

#### **3. `determineStatus(doc, isWeekendOff, isFutureDay)`**
- Present: Has checkIn or checkOut
- Absent: No punches on working day
- Holiday: Weekend or official holiday
- Leave types: Paid Leave, Unpaid Leave, Sick Leave, etc.

#### **4. Salary Deduction Formula**
```javascript
// Violation Pattern:
// - 3rd, 6th, 9th violations = 1 FULL DAY each
// - 4th, 5th, 7th, 8th violations = per-minute fine (minutes × 0.007)

violationFullDays = floor(violationCount / 3);
perMinuteDays = sum(violationMinutes × 0.007) for non-milestone violations;
totalDeductDays = violationFullDays + perMinuteDays + absentDays + unpaidLeaveDays + halfDays;
```

---

## 🔄 Data Flow Diagram

### **Daily Attendance:**
```
User clicks "Load & Save"
    ↓
Frontend: POST /api/hr/shift-attendance?date=YYYY-MM-DD
    ↓
Backend: Fetch AttendanceEvent (raw punches)
    ↓
Backend: Classify by shift time windows
    ↓
Backend: Group by employee, calculate checkIn/checkOut
    ↓
Backend: Save to ShiftAttendance collection
    ↓
Backend: Return items array
    ↓
Frontend: Display in table with filters
```

### **Monthly Attendance:**
```
User selects month
    ↓
Frontend: GET /api/hr/monthly-attendance?month=YYYY-MM
    ↓
Backend: Fetch ShiftAttendance records for month
    ↓
Backend: Load EmployeeShiftHistory for dynamic shifts
    ↓
Backend: For each employee, process each day:
    - Get shift for date (from history)
    - Calculate late/early violations
    - Determine status
    - Calculate salary deductions
    ↓
Backend: Return complete monthly data
    ↓
Frontend: Display in calendar-style table
```

---

## 📝 Key Files Summary

| File | Purpose | Type |
|------|---------|------|
| `app/hr/page.jsx` | Daily attendance UI | Frontend |
| `app/hr/monthly/page.jsx` | Monthly attendance UI | Frontend |
| `app/api/hr/shift-attendance/route.js` | Daily attendance API | Backend |
| `app/api/hr/monthly-attendance/route.js` | Monthly attendance API | Backend |
| `models/AttendanceEvent.js` | Raw punch events | Model |
| `models/ShiftAttendance.js` | Daily snapshots | Model |
| `models/Employee.js` | Employee master data | Model |
| `models/Shift.js` | Shift definitions | Model |
| `models/EmployeeShiftHistory.js` | Shift change history | Model |

---

## 🎯 Key Concepts

1. **Business Day**: A day that includes all shifts (09:00 current day → 06:00 next day)
2. **Dynamic Shifts**: Shifts determined from EmployeeShiftHistory, not just Employee.shift
3. **Time Windows**: Each shift has specific time ranges for punch classification
4. **Violation Formula**: Every 3rd violation = 1 full day, others = per-minute fine
5. **Salary Calculation**: Gross - (Deduction Days × Per-Day Salary) = Net

---

## 🔍 Where to Find Code

### **Daily Attendance Fetch:**
- **Frontend**: `next-app/app/hr/page.jsx` → `handleLoadAndSave()` function (line ~75)
- **Backend**: `next-app/app/api/hr/shift-attendance/route.js` → `POST` handler (line ~78)

### **Monthly Attendance Fetch:**
- **Frontend**: `next-app/app/hr/monthly/page.jsx` → `loadMonth()` function (line ~372)
- **Backend**: `next-app/app/api/hr/monthly-attendance/route.js` → `GET` handler (line ~400)

---

This architecture ensures:
- ✅ Real-time data from device events
- ✅ Historical shift tracking
- ✅ Accurate late/early calculations
- ✅ Comprehensive salary deductions
- ✅ Flexible filtering and search
- ✅ Excel export capabilities

