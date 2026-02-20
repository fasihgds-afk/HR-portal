'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';

function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi',
  });
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', dot: '#22c55e' },
    IDLE: { bg: 'rgba(234,179,8,0.15)', text: '#eab308', dot: '#eab308' },
    OFFLINE: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', dot: '#ef4444' },
    SUSPICIOUS: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', dot: '#f97316' },
  };
  const c = map[status] || map.OFFLINE;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      backgroundColor: c.bg, color: c.text,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', backgroundColor: c.dot,
        display: 'inline-block',
        animation: status === 'ACTIVE' ? 'pulse 2s infinite' : (status === 'SUSPICIOUS' ? 'pulse 1s infinite' : 'none'),
      }} />
      {status}
    </span>
  );
}

function ScoreBadge({ score, suspicious }) {
  if (score === null || score === undefined) {
    return <span style={{ color: '#64748b', fontSize: 12 }}>-</span>;
  }
  let color, bg, label;
  if (score >= 70) {
    color = '#22c55e'; bg = 'rgba(34,197,94,0.15)'; label = 'Genuine';
  } else if (score >= 30) {
    color = '#f97316'; bg = 'rgba(249,115,22,0.15)'; label = 'Suspicious';
  } else {
    color = '#ef4444'; bg = 'rgba(239,68,68,0.15)'; label = 'Auto-Clicker';
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
        backgroundColor: bg, color,
      }}>
        {score}
        {suspicious && <span style={{ fontSize: 10, marginLeft: 2 }} title="Suspicious activity detected">⚠</span>}
      </span>
      <span style={{ fontSize: 10, color, opacity: 0.8 }}>{label}</span>
    </div>
  );
}

function ProgressBar({ value, max, color = '#3b82f6', bgColor = '#1e293b' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 7, backgroundColor: bgColor, borderRadius: 4, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', backgroundColor: color,
          borderRadius: 4, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

export default function MonitoringPage() {
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(''); // empty = live mode (today + yesterday for night shifts)
  const [filter, setFilter] = useState('ALL');
  const [expandedEmp, setExpandedEmp] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // If no date selected → use live mode (catches night shift workers)
      const url = date
        ? `/api/monitor/productivity?date=${date}`
        : `/api/monitor/productivity?mode=live`;
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const employees = data?.employees || [];
  const filtered = filter === 'ALL'
    ? employees
    : filter === 'SUSPICIOUS'
      ? employees.filter(e => e.liveStatus === 'SUSPICIOUS' || (e.suspiciousMinutes > 0))
      : employees.filter(e => e.liveStatus === filter);

  const totalActive = employees.filter(e => e.liveStatus === 'ACTIVE').length;
  const totalIdle = employees.filter(e => e.liveStatus === 'IDLE').length;
  const totalOffline = employees.filter(e => e.liveStatus === 'OFFLINE').length;
  const totalSuspicious = employees.filter(e => e.liveStatus === 'SUSPICIOUS' || (e.suspiciousMinutes > 0)).length;

  // Theme-aware styles
  const bgPrimary = colors?.background?.primary || '#020617';
  const bgSecondary = colors?.background?.secondary || '#0f172a';
  const bgCard = colors?.background?.card || '#1e293b';
  const bgHover = colors?.background?.hover || '#334155';
  const textPrimary = colors?.text?.primary || '#f1f5f9';
  const textSecondary = colors?.text?.secondary || '#cbd5e1';
  const textMuted = colors?.text?.muted || '#64748b';
  const borderColor = colors?.border?.default || 'rgba(55,65,81,0.5)';
  const borderTable = colors?.border?.table || 'rgba(55,65,81,0.8)';
  const thBg = colors?.background?.table?.header || '#1e293b';
  const thColor = colors?.text?.table?.header || '#f1f5f9';
  const tdColor = colors?.text?.table?.cell || '#cbd5e1';
  const rowBg = colors?.background?.table?.row || '#0f172a';
  const rowEvenBg = colors?.background?.table?.rowEven || '#1e293b';

  return (
    <div style={{
      padding: 24, maxWidth: 1500, margin: '0 auto',
      fontFamily: 'Segoe UI, sans-serif', color: textPrimary,
    }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: textPrimary, margin: 0 }}>
            Live Monitoring
          </h1>
          <p style={{ color: textMuted, margin: '4px 0 0', fontSize: 13 }}>
            {date ? `Showing: ${date}` : 'Live — all active shifts (day + night)'} • Auto-refreshes every 30s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {date && (
            <button
              onClick={() => setDate('')}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${borderColor}`, backgroundColor: 'rgba(59,130,246,0.15)',
                color: '#60a5fa', fontWeight: 600,
              }}
            >Live</button>
          )}
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${borderColor}`,
              backgroundColor: bgCard, color: textPrimary,
              fontSize: 13, cursor: 'pointer',
            }}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total', value: employees.length, color: '#3b82f6', filterVal: 'ALL' },
          { label: 'Active', value: totalActive, color: '#22c55e', filterVal: 'ACTIVE' },
          { label: 'Idle', value: totalIdle, color: '#eab308', filterVal: 'IDLE' },
          { label: 'Offline', value: totalOffline, color: '#ef4444', filterVal: 'OFFLINE' },
          { label: 'Suspicious', value: totalSuspicious, color: '#f97316', filterVal: 'SUSPICIOUS' },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => setFilter(card.filterVal)}
            style={{
              padding: 18, borderRadius: 12,
              backgroundColor: filter === card.filterVal ? card.color + '15' : bgCard,
              border: `1px solid ${filter === card.filterVal ? card.color + '50' : borderColor}`,
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Break Policy Info */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', fontSize: 12,
      }}>
        {[
          { label: 'Official', desc: 'Counts as productive', color: '#3b82f6' },
          { label: 'Personal', desc: '60 min/shift allowed', color: '#f59e0b' },
          { label: 'Namaz', desc: '20 min/shift allowed', color: '#8b5cf6' },
          { label: 'Others', desc: 'Fully deducted', color: '#ef4444' },
        ].map(p => (
          <div key={p.label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.color }} />
            <span style={{ color: textPrimary, fontWeight: 600 }}>{p.label}:</span>
            <span style={{ color: textMuted }}>{p.desc}</span>
          </div>
        ))}
      </div>

      {/* Employee Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>
          No attendance records for this date.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${borderTable}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: thBg }}>
                {['Employee', 'Dept', 'Shift', 'Status', 'Score', 'Check In', 'Shift Hrs', 'Worked',
                  'Breaks', 'Allowed', 'Deducted', 'Productive', '%'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: 'left', fontWeight: 600,
                    color: thColor, borderBottom: `1px solid ${borderTable}`,
                    fontSize: 12, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => (
                <React.Fragment key={`${emp.empCode}-${emp.shift}-${i}`}>
                  <tr
                    onClick={() => { const uid = `${emp.empCode}-${emp.shift}-${i}`; setExpandedEmp(expandedEmp === uid ? null : uid); }}
                    style={{
                      backgroundColor: i % 2 === 0 ? rowBg : rowEvenBg,
                      borderBottom: `1px solid ${borderTable}`,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = bgHover}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? rowBg : rowEvenBg}
                  >
                    <td style={{ padding: '10px 12px', color: tdColor }}>
                      <div style={{ fontWeight: 600, color: textPrimary }}>{emp.employeeName || emp.empCode}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{emp.empCode}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: textMuted }}>{emp.department || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                      }}>{emp.shift}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={emp.liveStatus} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <ScoreBadge score={emp.avgActivityScore ?? emp.liveActivityScore} suspicious={emp.suspiciousMinutes > 0} />
                    </td>
                    <td style={{ padding: '10px 12px', color: tdColor }}>
                      {formatTime(emp.checkIn)}
                      {emp.late && <span style={{ color: '#ef4444', fontSize: 10, marginLeft: 4 }}>LATE</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: tdColor }}>{emp.shiftDurationHrs}h</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: textPrimary }}>{emp.totalWorkedHrs}h</td>
                    <td style={{ padding: '10px 12px', color: '#f59e0b' }}>
                      {emp.totalBreakHrs}h
                      <span style={{ color: textMuted, fontSize: 11, marginLeft: 3 }}>({emp.breakCount})</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 500 }}>
                      {emp.allowedBreakHrs}h
                    </td>
                    <td style={{ padding: '10px 12px', color: emp.deductedBreakHrs > 0 ? '#ef4444' : textMuted, fontWeight: 500 }}>
                      {emp.deductedBreakHrs}h
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#22c55e' }}>
                      {emp.productiveHrs}h
                    </td>
                    <td style={{ padding: '10px 12px', minWidth: 100 }}>
                      <ProgressBar
                        value={emp.productiveHrs}
                        max={emp.shiftDurationHrs}
                        bgColor={bgCard}
                        color={emp.productivityPct >= 80 ? '#22c55e' : emp.productivityPct >= 50 ? '#eab308' : '#ef4444'}
                      />
                    </td>
                  </tr>
                  {/* Expanded Break Breakdown */}
                  {expandedEmp === `${emp.empCode}-${emp.shift}-${i}` && (
                    <tr key={emp.empCode + '-detail'}>
                      <td colSpan={13} style={{ padding: 0, backgroundColor: bgCard }}>
                        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${borderTable}` }}>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
                            {emp.breakDown && Object.entries(emp.breakDown).map(([key, val]) => {
                              const labelMap = { official: 'Official', personal: 'Personal', namaz: 'Namaz', others: 'Others' };
                              const colorMap = { official: '#3b82f6', personal: '#f59e0b', namaz: '#8b5cf6', others: '#ef4444' };
                              return (
                                <div key={key} style={{
                                  padding: '8px 14px', borderRadius: 8, minWidth: 140,
                                  backgroundColor: bgSecondary, border: `1px solid ${borderColor}`,
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colorMap[key] }} />
                                    <span style={{ fontWeight: 600, fontSize: 12, color: textPrimary }}>{labelMap[key]}</span>
                                  </div>
                                  <div style={{ fontSize: 11, color: textMuted }}>
                                    Total: <span style={{ color: textSecondary }}>{val.totalMin}m</span>
                                    {' | '}Allowed: <span style={{ color: '#22c55e' }}>{val.allowedMin}m</span>
                                    {val.excessMin > 0 && (
                                      <>{' | '}Excess: <span style={{ color: '#ef4444' }}>{val.excessMin}m</span></>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Activity Score Summary */}
                          {(emp.avgActivityScore !== null || emp.suspiciousMinutes > 0) && (
                            <div style={{
                              display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap',
                            }}>
                              {emp.avgActivityScore !== null && (
                                <div style={{
                                  padding: '8px 14px', borderRadius: 8, minWidth: 140,
                                  backgroundColor: bgSecondary, border: `1px solid ${borderColor}`,
                                }}>
                                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>Avg Activity Score</div>
                                  <div style={{
                                    fontSize: 18, fontWeight: 700,
                                    color: emp.avgActivityScore >= 70 ? '#22c55e' : emp.avgActivityScore >= 30 ? '#f97316' : '#ef4444',
                                  }}>{emp.avgActivityScore}/100</div>
                                </div>
                              )}
                              {emp.suspiciousMinutes > 0 && (
                                <div style={{
                                  padding: '8px 14px', borderRadius: 8, minWidth: 140,
                                  backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.3)',
                                }}>
                                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>Suspicious Time</div>
                                  <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{emp.suspiciousMinutes}m</div>
                                </div>
                              )}
                              {emp.liveStatus === 'SUSPICIOUS' && (
                                <div style={{
                                  padding: '8px 14px', borderRadius: 8, minWidth: 140,
                                  backgroundColor: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.4)',
                                  display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                  <span style={{ fontSize: 20 }}>⚠</span>
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316' }}>SUSPICIOUS</div>
                                    <div style={{ fontSize: 10, color: '#fb923c' }}>Auto-clicker or irregular activity detected</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Individual breaks */}
                          <div style={{ fontSize: 12, color: textMuted }}>
                            {emp.breaks.map((b, j) => (
                              <div key={j} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '4px 0', borderBottom: j < emp.breaks.length - 1 ? `1px solid ${borderColor}` : 'none',
                              }}>
                                <span style={{
                                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                  backgroundColor: { Official: '#3b82f6', 'Personal Break': '#f59e0b', Namaz: '#8b5cf6' }[b.reason] || '#ef4444',
                                }} />
                                <span style={{ color: textSecondary, fontWeight: 500, minWidth: 100 }}>{b.reason}</span>
                                <span style={{ color: textMuted, flex: 1 }}>{b.customReason || ''}</span>
                                <span style={{ color: textMuted }}>{formatTime(b.startedAt)} → {b.isOpen ? 'Ongoing' : formatTime(b.endedAt)}</span>
                                <span style={{ fontWeight: 600, color: b.isOpen ? '#f59e0b' : textSecondary, minWidth: 50, textAlign: 'right' }}>
                                  {b.isOpen ? 'Active' : `${b.durationMin}m`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
