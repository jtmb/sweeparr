import prisma from '@/lib/db/client'

function fmtBytes(b: number): string {
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  return (b / 1e3).toFixed(0) + ' KB'
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

interface ReportItem {
  title: string
  year: number | null
  mediaType: string
  fileSizeBytes: number
  status: string
  errorMessage: string | null
  reasons: string
  lastWatchedAt: string | null
}

function renderReportHtml(
  items: ReportItem[],
  meta: { generatedAt: Date | string; status: string; totalItems: number }
): string {
  const isTest = meta.status === 'TEST'
  const displayStatus = isTest ? 'COMPLETED (test)' : meta.status

  const deletedCount = items.filter((i) => i.status === 'deleted').length
  const skippedCount = items.filter((i) => i.status === 'skipped').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const pendingCount = items.filter((i) => i.status === 'pending').length
  const freedBytes = items.filter((i) => i.status === 'deleted').reduce((s, i) => s + i.fileSizeBytes, 0)
  const totalBytes = items.reduce((s, i) => s + i.fileSizeBytes, 0)

  const itemsJson = JSON.stringify(items).replace(/<\/script>/gi, '<\\/script>')

  const summaryHtml =
    isTest || meta.status === 'COMPLETED'
      ? `
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td style="background:#d1fae5;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:#059669">${deletedCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Deleted</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:#f3f4f6;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700">${skippedCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Skipped</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:${errorCount > 0 ? '#ffe4e6' : '#f3f4f6'};border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:${errorCount > 0 ? '#e11d48' : 'inherit'}">${errorCount}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Errors</div>
      </td>
      <td style="width:8px"></td>
      <td style="background:#ede9fe;border-radius:8px;padding:16px 20px;text-align:center;width:25%">
        <div style="font-size:28px;font-weight:700;color:#7c3aed">${fmtBytes(freedBytes)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Space Freed</div>
      </td>
    </tr>
  </table>`
      : pendingCount > 0
      ? `<p style="background:#fef3c7;border-radius:8px;padding:12px 16px;font-size:13px;margin-bottom:20px">${pendingCount} candidate(s) pending review &mdash; ${fmtBytes(totalBytes)} freeable</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cleanup Report \u2013 ${fmtDate(meta.generatedAt)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;max-width:1020px;margin:0 auto;padding:24px;font-size:13px}
  h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .meta{color:#6b7280;font-size:13px;margin-bottom:20px}
  table.data{width:100%;border-collapse:collapse;font-size:13px}
  table.data thead tr{background:#f9fafb;border-bottom:2px solid #e5e7eb}
  table.data th{padding:10px 12px;text-align:left;font-weight:600;white-space:nowrap;user-select:none;cursor:pointer}
  table.data th:hover{background:#f1f5f9}
  table.data th.sorted{background:#eff6ff}
  table.data td{padding:8px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
  table.data tbody tr:hover{background:#f9fafb}
  .sort-arrow{display:inline-block;margin-left:4px;opacity:0.35;font-size:10px}
  .sort-arrow.active{opacity:1}
  .status-deleted{color:#10b981;font-weight:600}
  .status-skipped{color:#6b7280;font-weight:600}
  .status-error{color:#f43f5e;font-weight:600}
  .status-pending{color:#f59e0b;font-weight:600}
  .err-msg{display:block;color:#f43f5e;font-size:11px;margin-top:2px}
  .controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .controls-left{display:flex;align-items:center;gap:12px}
  .page-info{color:#6b7280}
  .btn{border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit}
  .btn:hover{background:#f9fafb}
  .btn:disabled{opacity:0.4;cursor:default}
  .btn.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
  .page-btns{display:flex;gap:4px;flex-wrap:wrap}
  select.ps{border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;background:#fff;cursor:pointer}
  .footer{color:#9ca3af;font-size:11px;margin-top:20px}
</style>
</head>
<body>
  <h1>Cleanup Report</h1>
  ${isTest ? '<p style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:12px">&#9888;&#65039; <strong>Test notification</strong> — this is sample/filler data sent from Sweeparr settings.</p>' : ''}
  <p class="meta">Generated ${fmtDate(meta.generatedAt)}&nbsp;&nbsp;&bull;&nbsp;&nbsp;${meta.totalItems} candidates&nbsp;&nbsp;&bull;&nbsp;&nbsp;Status: ${displayStatus}</p>
  ${summaryHtml}
  <div id="app"></div>
  <p class="footer">Exported from Sweeparr on ${new Date().toLocaleString()}</p>
<script type="application/json" id="rdata">${itemsJson}</script>
<script>
(function(){
  try {
  var ITEMS = JSON.parse(document.getElementById('rdata').textContent);
  var sortCol = 'fileSizeBytes', sortDir = 'desc', page = 1, pageSize = 50;

  var COLS = [
    {key:'title',         label:'Title'},
    {key:'mediaType',     label:'Type'},
    {key:'fileSizeBytes', label:'Size'},
    {key:'status',        label:'Status'},
    {key:'reasons',       label:'Reasons'},
    {key:'lastWatchedAt', label:'Last Watched'},
  ];

  function fmtBytes(b){
    if(b>=1e12) return (b/1e12).toFixed(2)+' TB';
    if(b>=1e9)  return (b/1e9).toFixed(2)+' GB';
    if(b>=1e6)  return (b/1e6).toFixed(1)+' MB';
    return (b/1e3).toFixed(0)+' KB';
  }
  function fmtDate(d){ return d ? new Date(d).toLocaleDateString() : '\u2014'; }
  function esc(s){ return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function sorted(){
    var arr = ITEMS.slice();
    arr.sort(function(a,b){
      var av=a[sortCol], bv=b[sortCol];
      if(sortCol==='lastWatchedAt'){
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if(typeof av==='string') {
        av=av.toLowerCase(); bv=(bv||'').toLowerCase();
      }
      if(av<bv) return sortDir==='asc'?-1:1;
      if(av>bv) return sortDir==='asc'?1:-1;
      return 0;
    });
    return arr;
  }

  function totalPages(items){ return Math.max(1, Math.ceil(items.length/pageSize)); }

  function render(){
    var items = sorted();
    var tp = totalPages(items);
    if(page>tp) page=tp;
    var start=(page-1)*pageSize, end=Math.min(start+pageSize, items.length);
    var slice=items.slice(start,end);

    var ths = COLS.map(function(c){
      var arrow = sortCol===c.key ? (sortDir==='asc'?'\u25b2':'\u25bc') : '\u25bc';
      var activeClass = sortCol===c.key?' sorted':'';
      var arrowClass = sortCol===c.key?' active':'';
      return '<th class="'+activeClass+'" onclick="setSort(\\''+c.key+'\\')">'
        +esc(c.label)+'<span class="sort-arrow'+arrowClass+'">'+arrow+'</span></th>';
    }).join('');

    var trs = slice.map(function(i){
      var statusCls = 'status-'+(i.status||'pending');
      var errHtml = i.errorMessage ? '<span class="err-msg">'+esc(i.errorMessage)+'</span>' : '';
      return '<tr>'
        +'<td style="font-weight:500">'+esc(i.title)+(i.year?' <span style="color:#6b7280;font-weight:400">('+i.year+')</span>':'')+'</td>'
        +'<td style="color:#6b7280;text-transform:capitalize">'+esc(i.mediaType)+'</td>'
        +'<td style="color:#6b7280">'+fmtBytes(i.fileSizeBytes)+'</td>'
        +'<td><span class="'+statusCls+'">'+esc(i.status)+'</span>'+errHtml+'</td>'
        +'<td style="color:#6b7280">'+esc(i.reasons)+'</td>'
        +'<td style="color:#6b7280">'+fmtDate(i.lastWatchedAt)+'</td>'
        +'</tr>';
    }).join('');

    var pageBtns='';
    var lo=Math.max(1,page-3), hi=Math.min(tp,page+3);
    if(lo>1) pageBtns+='<button class="btn" onclick="goPage(1)">1</button>'+(lo>2?'<span style="padding:0 4px;color:#9ca3af">\u2026</span>':'');
    for(var p2=lo;p2<=hi;p2++){
      pageBtns+='<button class="btn'+(p2===page?' active':'')+'" onclick="goPage('+p2+')">'+p2+'</button>';
    }
    if(hi<tp) pageBtns+=(hi<tp-1?'<span style="padding:0 4px;color:#9ca3af">\u2026</span>':'')+'<button class="btn" onclick="goPage('+tp+')">'+tp+'</button>';

    var html='<div class="controls">'
      +'<div class="controls-left">'
      +'<span class="page-info">Showing '+(start+1)+'\u2013'+end+' of '+items.length+' items</span>'
      +'<select class="ps" onchange="setPageSize(+this.value)">'
      +[25,50,100,250].map(function(n){return '<option value="'+n+'"'+(n===pageSize?' selected':'')+'>'+n+' per page</option>';}).join('')
      +'</select>'
      +'</div>'
      +'<div class="page-btns">'
      +'<button class="btn" onclick="goPage(page-1)" '+(page<=1?'disabled':'')+'>&#8249; Prev</button>'
      +pageBtns
      +'<button class="btn" onclick="goPage(page+1)" '+(page>=tp?'disabled':'')+'>Next &#8250;</button>'
      +'</div>'
      +'</div>'
      +'<table class="data"><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table>'
      +'<div class="controls" style="margin-top:10px;margin-bottom:0">'
      +'<div class="controls-left"><span class="page-info">Page '+page+' of '+tp+'</span></div>'
      +'<div class="page-btns">'
      +'<button class="btn" onclick="goPage(page-1)" '+(page<=1?'disabled':'')+'>&#8249; Prev</button>'
      +'<button class="btn" onclick="goPage(page+1)" '+(page>=tp?'disabled':'')+'>Next &#8250;</button>'
      +'</div></div>';

    document.getElementById('app').innerHTML=html;
  }

  window.setSort=function(col){
    if(sortCol===col){ sortDir=sortDir==='asc'?'desc':'asc'; } else { sortCol=col; sortDir='desc'; }
    page=1; render();
  };
  window.goPage=function(p){ var items=sorted(); var tp=totalPages(items); page=Math.max(1,Math.min(tp,p)); render(); };
  window.setPageSize=function(n){ pageSize=n; page=1; render(); };

  render();
  } catch(e) {
    document.getElementById('app').innerHTML='<p style="color:#f43f5e;padding:16px;font-family:monospace">Export script error: '+String(e)+'</p>';
  }
})();
</script>
</body></html>`
}

export async function generateReportHtml(reportId: string): Promise<string> {
  const report = await prisma.cleanupReport.findUnique({
    where: { id: reportId },
    include: { items: { orderBy: { fileSizeBytes: 'desc' } } },
  })
  if (!report) throw new Error(`Report ${reportId} not found`)

  const items: ReportItem[] = report.items.map((item) => ({
    title: item.title,
    year: item.year ?? null,
    mediaType: item.mediaType,
    fileSizeBytes: Number(item.fileSizeBytes),
    status: item.status,
    errorMessage: item.errorMessage ?? null,
    reasons: (JSON.parse(item.reasons) as string[]).join(', '),
    lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
  }))

  return renderReportHtml(items, {
    generatedAt: report.generatedAt,
    status: report.status,
    totalItems: report.totalItems,
  })
}

/** Generates a test HTML report with 250 fake items for notification testing. */
export function generateTestReportHtml(): string {
  const TITLES = [
    'Breaking Bad', 'Game of Thrones', 'The Mandalorian', 'Stranger Things',
    'The Boys', 'Ozark', 'Succession', 'The Crown', 'Fargo', 'True Detective',
    'Interstellar', 'Inception', 'The Dark Knight', 'Avengers: Endgame',
    'Dune', 'Oppenheimer', 'Top Gun: Maverick', 'John Wick',
    'Everything Everywhere All at Once', 'The Batman',
    'Spider-Man: No Way Home', 'No Time to Die', 'Black Panther',
    'House of the Dragon', 'Andor', 'The Last of Us', 'Ted Lasso', 'Barry',
    'Severance', 'The White Lotus', 'Shogun', 'Fallout', 'The Bear',
    'Abbott Elementary', 'Yellowjackets', 'Only Murders in the Building',
    'Fleabag', 'Chernobyl', 'The Terror', 'Dark',
    'Money Heist', 'Squid Game', 'Alice in Borderland',
    'Peaky Blinders', 'Boardwalk Empire', 'The Wire', 'The Sopranos',
    'Mad Men', 'Better Call Saul', 'Miniseries',
  ]
  const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
  const TYPES = ['movie', 'show', 'show', 'movie', 'show']
  const REASONS = ['STALE_WATCHED', 'NEVER_WATCHED', 'OLD_AGE', 'STALE_WATCHED', 'STALE_WATCHED']
  const STATUSES = ['deleted', 'deleted', 'deleted', 'deleted', 'deleted', 'skipped', 'skipped', 'error', 'error', 'pending']
  const ERRORS = [
    'Sonarr responded with status 500',
    'timeout of 30000ms exceeded',
    'Not found in arr and Plex deletion unavailable',
    null, null,
  ]
  const SIZES = [
    89_000_000_000, 72_500_000_000, 55_200_000_000, 43_800_000_000, 38_100_000_000,
    29_700_000_000, 22_400_000_000, 18_900_000_000, 14_300_000_000, 11_600_000_000,
    8_800_000_000, 6_200_000_000, 4_500_000_000, 3_100_000_000, 2_200_000_000,
    1_800_000_000, 1_200_000_000, 900_000_000, 650_000_000, 480_000_000,
  ]
  const BASE_DATE = new Date('2025-01-15T00:00:00Z').getTime()

  const items: ReportItem[] = Array.from({ length: 250 }, (_, i) => {
    const titleBase = TITLES[i % TITLES.length]
    const title = i >= TITLES.length ? `${titleBase} S${Math.floor(i / TITLES.length) + 2}` : titleBase
    const status = STATUSES[i % STATUSES.length]
    const errMsg = status === 'error' ? (ERRORS[i % ERRORS.length] ?? null) : null
    const watchedOffsetMs = (i * 4_320_000_000) % (3 * 365 * 24 * 3600 * 1000)
    return {
      title,
      year: YEARS[i % YEARS.length],
      mediaType: TYPES[i % TYPES.length],
      fileSizeBytes: SIZES[i % SIZES.length],
      status,
      errorMessage: errMsg,
      reasons: REASONS[i % REASONS.length],
      lastWatchedAt: status !== 'pending'
        ? new Date(BASE_DATE - watchedOffsetMs).toISOString()
        : null,
    }
  })

  return renderReportHtml(items, {
    generatedAt: new Date(),
    status: 'TEST',
    totalItems: items.length,
  })
}

function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Generates a Gmail-safe inline-styled HTML email body for a report.
 * No <style> blocks, no JavaScript — all CSS is inline.
 * Shows up to 100 items sorted by size descending.
 */
export function generateEmailBodyHtml(
  items: ReportItem[],
  meta: { generatedAt: Date | string; status: string; totalItems: number },
  isTest = false
): string {
  const deletedCount = items.filter((i) => i.status === 'deleted').length
  const skippedCount = items.filter((i) => i.status === 'skipped').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const freedBytes = items.filter((i) => i.status === 'deleted').reduce((s, i) => s + i.fileSizeBytes, 0)

  const sorted = items.slice().sort((a, b) => b.fileSizeBytes - a.fileSizeBytes)
  const shown = sorted.slice(0, 100)
  const remaining = sorted.length - shown.length

  const STATUS_COLOR: Record<string, string> = {
    deleted: '#059669',
    skipped: '#6b7280',
    error: '#e11d48',
    pending: '#d97706',
  }

  const rows = shown.map((item) => {
    const color = STATUS_COLOR[item.status] ?? '#6b7280'
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:500;color:#111827">
        ${esc(item.title)}${item.year ? ` <span style="color:#9ca3af;font-weight:400">(${item.year})</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-transform:capitalize">${esc(item.mediaType)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;white-space:nowrap">${fmtBytes(item.fileSizeBytes)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:${color}">${esc(item.status)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${esc(item.reasons)}</td>
    </tr>`
  }).join('')

  const moreRow = remaining > 0
    ? `<tr><td colspan="5" style="padding:10px 12px;font-size:12px;color:#9ca3af;text-align:center;font-style:italic">… and ${remaining} more item${remaining !== 1 ? 's' : ''} (see attached HTML report for full list)</td></tr>`
    : ''

  const testBanner = isTest
    ? `<tr><td colspan="1" style="padding:10px 16px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e;margin-bottom:12px">
        &#9888; <strong>Test notification</strong> — this is sample/filler data sent from Sweeparr settings.
      </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:600px;width:100%">

    ${testBanner ? `<tr><td style="padding:12px 24px;background:#fef3c7">${testBanner}</td></tr>` : ''}

    <!-- Header -->
    <tr><td style="padding:24px 24px 16px;border-bottom:1px solid #e5e7eb">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#111827">🧹 Cleanup Report</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280">
        Generated ${fmtDate(meta.generatedAt)} &nbsp;&bull;&nbsp; ${meta.totalItems} candidate${meta.totalItems !== 1 ? 's' : ''} &nbsp;&bull;&nbsp; Status: ${isTest ? 'COMPLETED (test)' : esc(meta.status)}
      </p>
    </td></tr>

    <!-- Stats -->
    <tr><td style="padding:20px 24px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#d1fae5;border-radius:8px;padding:14px;text-align:center;width:25%">
            <div style="font-size:26px;font-weight:700;color:#059669">${deletedCount}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Deleted</div>
          </td>
          <td style="width:8px"></td>
          <td style="background:#f3f4f6;border-radius:8px;padding:14px;text-align:center;width:25%">
            <div style="font-size:26px;font-weight:700;color:#374151">${skippedCount}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Skipped</div>
          </td>
          <td style="width:8px"></td>
          <td style="background:${errorCount > 0 ? '#ffe4e6' : '#f3f4f6'};border-radius:8px;padding:14px;text-align:center;width:25%">
            <div style="font-size:26px;font-weight:700;color:${errorCount > 0 ? '#e11d48' : '#374151'}">${errorCount}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Errors</div>
          </td>
          <td style="width:8px"></td>
          <td style="background:#ede9fe;border-radius:8px;padding:14px;text-align:center;width:25%">
            <div style="font-size:26px;font-weight:700;color:#7c3aed">${fmtBytes(freedBytes)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Space Freed</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Table -->
    <tr><td style="padding:0 24px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb">
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;white-space:nowrap">Title</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;white-space:nowrap">Type</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;white-space:nowrap">Size</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;white-space:nowrap">Status</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#374151;white-space:nowrap">Reason</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${moreRow}
        </tbody>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
      This is an automated email sent by Sweeparr. Please do not reply. &nbsp;&bull;&nbsp; ${new Date().toLocaleString()}
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`
}

export async function generateEmailBodyHtmlForReport(reportId: string): Promise<string> {
  const report = await prisma.cleanupReport.findUnique({
    where: { id: reportId },
    include: { items: { orderBy: { fileSizeBytes: 'desc' } } },
  })
  if (!report) throw new Error(`Report ${reportId} not found`)

  const items: ReportItem[] = report.items.map((item) => ({
    title: item.title,
    year: item.year ?? null,
    mediaType: item.mediaType,
    fileSizeBytes: Number(item.fileSizeBytes),
    status: item.status,
    errorMessage: item.errorMessage ?? null,
    reasons: (JSON.parse(item.reasons) as string[]).join(', '),
    lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
  }))

  return generateEmailBodyHtml(items, {
    generatedAt: report.generatedAt,
    status: report.status,
    totalItems: report.totalItems,
  })
}
