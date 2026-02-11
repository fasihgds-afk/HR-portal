'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useSession } from 'next-auth/react';

function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Karachi',
  });
}

export default function EmployeeProductivityPage() {
  const { colors } = useTheme();
  const { data: session } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(''); // empty = auto-detect from shift
  const [autoDate, setAutoDate] = useState('');

  const empCode = session?.user?.empCode || new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  ).get('empCode') || '';

  // Theme colors
  const bgPrimary = colors?.background?.primary || '#020617';
  const bgCard = colors?.background?.card || '#1e293b';
  const bgSecondary = colors?.background?.secondary || '#0f172a';
  const textPrimary = colors?.text?.primary || '#f1f5f9';
  const textSecondary = colors?.text?.secondary || '#cbd5e1';
  const textMuted = colors?.text?.muted || '#64748b';
  const borderColor = colors?.border?.default || 'rgba(55,65,81,0.5)';

  const fetchData = useCallback(async () => {
    if (!empCode) return;
    try {
      // If no date selected, let API auto-detect from shift (night shift aware)
      const url = date
        ? `/api/monitor/productivity?date=${date}&empCode=${empCode}`
        : `/api/monitor/productivity?empCode=${empCode}`;
      const res = await fetch(url);
      const json = await res.json();
      setData(json?.employees?.[0] || null);
      if (json?.date) setAutoDate(json.date);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [date, empCode]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!empCode) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: textMuted, fontFamily: 'Segoe UI, sans-serif' }}>
        <p>Employee code not found. Please use: <code style={{ color: '#60a5fa' }}>/employee/productivity?empCode=YOUR_CODE</code></p>
      </div>
    );
  }

  const breakColors = {
    'Official': '#3b82f6',
    'Personal Break': '#f59e0b',
    'Namaz': '#8b5cf6',
    'Others': '#ef4444',
  };

  return (
    <div style={{
      padding: 24, maxWidth: 800, margin: '0 auto',
      fontFamily: 'Segoe UI, sans-serif', color: textPrimary,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: textPrimary, margin: 0 }}>
            My Productivity
          </h1>
          <p style={{ color: textMuted, margin: '4px 0 0', fontSize: 13 }}>
            {data?.employeeName || empCode} • {data?.shift || '-'} Shift
          </p>
        </div>
        <input
          type="date"
          value={date || autoDate}
          onChange={e => setDate(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${borderColor}`,
            backgroundColor: bgCard, color: textPrimary,
            fontSize: 13, cursor: 'pointer',
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading...</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>
          No attendance record found for this date.
        </div>
      ) : (
        <>
          {/* Productivity Ring */}
          <div style={{
            textAlign: 'center', padding: 24, marginBottom: 20,
            backgroundColor: bgCard, borderRadius: 12, border: `1px solid ${borderColor}`,
          }}>
            <div style={{ position: 'relative', display: 'inline-block', width: 150, height: 150 }}>
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r="65" fill="none" stroke={bgSecondary} strokeWidth="10" />
                <circle cx="75" cy="75" r="65" fill="none"
                  stroke={data.productivityPct >= 80 ? '#22c55e' : data.productivityPct >= 50 ? '#eab308' : '#ef4444'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${data.productivityPct * 4.08} 408`}
                  transform="rotate(-90 75 75)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: textPrimary }}>{data.productivityPct}%</div>
                <div style={{ fontSize: 11, color: textMuted }}>Productive</div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Shift Duration', value: data.shiftDurationHrs, unit: 'hrs', color: '#60a5fa' },
              { label: 'Total Worked', value: data.totalWorkedHrs, unit: 'hrs', color: textPrimary },
              { label: 'Productive', value: data.productiveHrs, unit: 'hrs', color: '#22c55e' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '16px 14px', borderRadius: 10, backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
              }}>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: textMuted }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Break Summary */}
          <div style={{
            padding: 18, borderRadius: 12, backgroundColor: bgCard,
            border: `1px solid ${borderColor}`, marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: textPrimary }}>
              Break Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, backgroundColor: bgSecondary, border: `1px solid ${borderColor}` }}>
                <div style={{ fontSize: 11, color: textMuted }}>Total Break</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{data.totalBreakHrs}<span style={{ fontSize: 12, color: textMuted }}> hrs</span></div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, backgroundColor: bgSecondary, border: `1px solid ${borderColor}` }}>
                <div style={{ fontSize: 11, color: textMuted }}>Allowed (no deduction)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{data.allowedBreakHrs}<span style={{ fontSize: 12, color: textMuted }}> hrs</span></div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, backgroundColor: bgSecondary, border: `1px solid ${borderColor}` }}>
                <div style={{ fontSize: 11, color: textMuted }}>Deducted from productive</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: data.deductedBreakHrs > 0 ? '#ef4444' : '#22c55e' }}>
                  {data.deductedBreakHrs}<span style={{ fontSize: 12, color: textMuted }}> hrs</span>
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, backgroundColor: bgSecondary, border: `1px solid ${borderColor}` }}>
                <div style={{ fontSize: 11, color: textMuted }}>Break Count</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: textSecondary }}>{data.breakCount}</div>
              </div>
            </div>

            {/* Category Breakdown */}
            {data.breakDown && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(data.breakDown).map(([key, val]) => {
                  const labelMap = { official: 'Official', personal: 'Personal', namaz: 'Namaz', others: 'Others' };
                  const colorMap = { official: '#3b82f6', personal: '#f59e0b', namaz: '#8b5cf6', others: '#ef4444' };
                  const ruleMap = { official: 'Productive', personal: '60m allowed', namaz: '20m allowed', others: 'Deducted' };
                  if (val.totalMin === 0) return null;
                  return (
                    <div key={key} style={{
                      flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8,
                      backgroundColor: bgPrimary, border: `1px solid ${borderColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: colorMap[key] }} />
                        <span style={{ fontWeight: 600, fontSize: 12, color: textPrimary }}>{labelMap[key]}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: colorMap[key] }}>{val.totalMin}m</div>
                      <div style={{ fontSize: 10, color: textMuted }}>{ruleMap[key]}</div>
                      {val.excessMin > 0 && (
                        <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                          {val.excessMin}m over limit
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attendance Info */}
          <div style={{
            padding: 18, borderRadius: 12, backgroundColor: bgCard,
            border: `1px solid ${borderColor}`, marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: textPrimary }}>Attendance</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
              <div>
                <span style={{ color: textMuted }}>Check In: </span>
                <strong style={{ color: textPrimary }}>{formatTime(data.checkIn)}</strong>
                {data.late && <span style={{ color: '#ef4444', marginLeft: 6, fontSize: 11 }}>LATE</span>}
              </div>
              <div>
                <span style={{ color: textMuted }}>Check Out: </span>
                <strong style={{ color: textPrimary }}>{data.checkOut ? formatTime(data.checkOut) : 'Still working'}</strong>
                {data.earlyLeave && <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 11 }}>EARLY</span>}
              </div>
              <div>
                <span style={{ color: textMuted }}>Status: </span>
                <strong style={{ color: textPrimary }}>{data.attendanceStatus || '-'}</strong>
              </div>
              <div>
                <span style={{ color: textMuted }}>Breaks: </span>
                <strong style={{ color: textPrimary }}>{data.breakCount}</strong>
              </div>
            </div>
          </div>

          {/* Activity Score */}
          {data.avgActivityScore !== null && data.avgActivityScore !== undefined && (
            <div style={{
              padding: 18, borderRadius: 12, backgroundColor: bgCard,
              border: `1px solid ${borderColor}`, marginBottom: 20,
            }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: textPrimary }}>Activity Quality</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
                  backgroundColor: data.avgActivityScore >= 70 ? 'rgba(34,197,94,0.15)' :
                    data.avgActivityScore >= 30 ? 'rgba(249,115,22,0.15)' : 'rgba(239,68,68,0.15)',
                  color: data.avgActivityScore >= 70 ? '#22c55e' :
                    data.avgActivityScore >= 30 ? '#f97316' : '#ef4444',
                  border: `2px solid ${data.avgActivityScore >= 70 ? '#22c55e' :
                    data.avgActivityScore >= 30 ? '#f97316' : '#ef4444'}`,
                }}>
                  {data.avgActivityScore}
                </div>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: data.avgActivityScore >= 70 ? '#22c55e' :
                      data.avgActivityScore >= 30 ? '#f97316' : '#ef4444',
                  }}>
                    {data.avgActivityScore >= 70 ? 'Genuine Activity' :
                      data.avgActivityScore >= 30 ? 'Activity Under Review' : 'Low Activity Score'}
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                    This score reflects the natural variety in your mouse and keyboard usage patterns.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Break History */}
          <div style={{
            padding: 18, borderRadius: 12, backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: textPrimary }}>Break History</h3>
            {data.breaks.length === 0 ? (
              <p style={{ color: textMuted, textAlign: 'center', padding: 16 }}>No breaks recorded</p>
            ) : (
              data.breaks.map((brk, i) => {
                const color = breakColors[brk.reason] || '#ef4444';
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                    backgroundColor: bgSecondary, border: `1px solid ${borderColor}`,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: textPrimary }}>
                        {brk.reason}{brk.customReason ? ` — ${brk.customReason}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>
                        {formatTime(brk.startedAt)} → {brk.isOpen ? 'Ongoing' : formatTime(brk.endedAt)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: brk.isOpen ? '#f59e0b' : textSecondary }}>
                      {brk.isOpen ? 'Active' : `${brk.durationMin} min`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
