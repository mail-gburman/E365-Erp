import React from "react";

const PAGE_SIZES = [10, 25, 50, 100];

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeP = Math.min(page, totalPages);

  const range = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= safeP - delta && i <= safeP + delta)) {
      range.push(i);
    } else if (range[range.length - 1] !== "...") {
      range.push("...");
    }
  }

  return (
    <div className="paginationWrap">
      <div className="paginationInfo">
        Showing {Math.min((safeP - 1) * pageSize + 1, total)}–{Math.min(safeP * pageSize, total)} of {total}
      </div>
      <div className="paginationControls">
        <button className="pgBtn" disabled={safeP <= 1} onClick={() => onPageChange(safeP - 1)}>&laquo; Prev</button>
        {range.map((item, i) =>
          item === "..." ? (
            <span key={`e${i}`} className="pgEllipsis">...</span>
          ) : (
            <button key={item} className={`pgBtn ${item === safeP ? "pgBtnActive" : ""}`} onClick={() => onPageChange(item)}>{item}</button>
          )
        )}
        <button className="pgBtn" disabled={safeP >= totalPages} onClick={() => onPageChange(safeP + 1)}>Next &raquo;</button>
      </div>
      <div className="paginationSize">
        <select value={pageSize} onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}>
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
    </div>
  );
}

export function usePagination(data, defaultSize = 25) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultSize);

  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = data.slice((safePage - 1) * pageSize, safePage * pageSize);

  React.useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [total, pageSize]);

  return { page: safePage, pageSize, setPage, setPageSize, pageData, total };
}
