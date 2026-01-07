/**
 * Pagination Controls Component
 * 
 * Reusable pagination controls for data tables
 */

export default function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  loading = false,
}) {
  if (totalPages <= 1) return null;

  const startItem = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: '#6b7280',
        }}
      >
        Showing {startItem} to {endItem} of {totalItems} employees
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1 || loading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: currentPage === 1 ? '#f3f4f6' : '#ffffff',
            color: currentPage === 1 ? '#9ca3af' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: currentPage === 1 || loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          First
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1 || loading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: currentPage === 1 ? '#f3f4f6' : '#ffffff',
            color: currentPage === 1 ? '#9ca3af' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: currentPage === 1 || loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Previous
        </button>
        <span
          style={{
            padding: '6px 12px',
            fontSize: 13,
            color: '#374151',
            fontWeight: 500,
          }}
        >
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages || loading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: currentPage === totalPages ? '#f3f4f6' : '#ffffff',
            color: currentPage === totalPages ? '#9ca3af' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: currentPage === totalPages || loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || loading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: currentPage === totalPages ? '#f3f4f6' : '#ffffff',
            color: currentPage === totalPages ? '#9ca3af' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: currentPage === totalPages || loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Last
        </button>
      </div>
    </div>
  );
}

