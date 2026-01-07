'use client';

import { useEffect, useState } from 'react';

export default function EmployeeDashboardPage() {
  const [empCode, setEmpCode] = useState('EMP001');
  const [month, setMonth] = useState('2025-11');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadAttendance() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/employee/attendance?empCode=${encodeURIComponent(
          empCode
        )}&month=${encodeURIComponent(month)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
      } else {
        setDays(data.days || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Employee Attendance</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium mb-1">Employee Code</label>
          <input
            className="border px-2 py-1 rounded"
            value={empCode}
            onChange={e => setEmpCode(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Month (YYYY-MM)</label>
          <input
            className="border px-2 py-1 rounded"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        </div>

        <button
          onClick={loadAttendance}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Load
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      <table className="mt-4 w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left">Date</th>
            <th className="border px-2 py-1 text-left">First In</th>
            <th className="border px-2 py-1 text-left">Last Out</th>
            <th className="border px-2 py-1 text-left">Total Punches</th>
          </tr>
        </thead>
        <tbody>
          {days.length === 0 && !loading && (
            <tr>
              <td colSpan="4" className="text-center py-4">
                No attendance records for this month.
              </td>
            </tr>
          )}
          {days.map(d => (
            <tr key={d.date}>
              <td className="border px-2 py-1">{d.date}</td>
              <td className="border px-2 py-1">
                {d.firstIn ? new Date(d.firstIn).toLocaleTimeString() : '-'}
              </td>
              <td className="border px-2 py-1">
                {d.lastOut ? new Date(d.lastOut).toLocaleTimeString() : '-'}
              </td>
              <td className="border px-2 py-1">{d.eventsCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
