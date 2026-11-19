/*****************************************************************
 * MEC GROUP – BOT QUẢN LÝ THU CHI + VÍ (Google Sheet + Telegram)   — BẢN 2
 * ---------------------------------------------------------------
 * - 1 sổ cái duy nhất (tab SoCai). Mọi báo cáo đều tính từ sổ cái.
 * - Quản lý cả công ty (dự án kinh doanh) lẫn cá nhân/gia đình,
 *   tách bằng "Nhóm", và theo dõi từng "Ví" (Tiền mặt, Ngân hàng, Tiết kiệm).
 * - Chuyển tiền giữa các ví (rút ATM, gửi tiết kiệm) KHÔNG phải chi.
 * - Không dùng AI. Dán TRỌN FILE này vào Apps Script gắn với Google Sheet.
 * - Chỉ có DUY NHẤT 1 hàm doPost trong dự án (đừng thêm file khác).
 * BOT_TOKEN và PIN lưu ở Script Properties (menu MEC Group), KHÔNG nằm trong code.
 * Cài đặt / nâng cấp: xem HUONG_DAN.md
 *****************************************************************/

const CONFIG = {
  // BOT_TOKEN và PIN KHÔNG để trong code. Cài bằng menu "MEC Group" trong Google Sheet
  // (lưu ở Script Properties). Hai dòng dưới chỉ là phương án dự phòng, để trống.
  BOT_TOKEN: '',
  PIN: '',
  WEBAPP_URL: '',                       // để trống = tự lấy sau khi Deploy
  TZ: 'Asia/Ho_Chi_Minh',
  GIO_BAO_CAO: 20,                      // báo cáo ngày tự động lúc 20:30
  PHUT_BAO_CAO: 30
};

const SCHEMA_VERSION = '2';
const TAB = { SOCAI: 'SoCai', CAUHINH: 'CauHinh', BAOCAO: 'BaoCao' };
const COL = { ID: 0, DATE: 1, PROJECT: 2, CHANNEL: 3, TYPE: 4, CAT: 5, AMOUNT: 6, PARTNER: 7, NOTE: 8, SOURCE: 9, AT: 10, WHO: 11, WALLET: 12, TO: 13 };
const NCOL = 14;
const SOCAI_HEADERS = ['ID', 'Ngày', 'Dự án', 'Kênh', 'Loại', 'Danh mục', 'Số tiền', 'Đối tác', 'Ghi chú', 'Nguồn', 'Nhập lúc', 'Người nhập', 'Ví', 'Ví đến (khi CHUYEN)'];
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const G_BUSINESS = 'Kinh doanh', G_LATVAT = 'Cá nhân lặt vặt', G_UNCLEAR = 'Tiền mặt chưa rõ';
const DEFAULT_CAT_BY_PROJECT = { thiquy: 'phithiquy', chuaro: 'chikhac' }; // dự án -> danh mục chi mặc định

// Dữ liệu mẫu cho tab CauHinh (Anh sửa trực tiếp trong tab CauHinh được)
const SEED = {
  duan: [['SuperMall', 'sm,supermall', 'Kinh doanh'], ['Dungo', 'dg,dungo,shopdungo', 'Kinh doanh'], ['Chung', 'mec,mecgroup,chung', 'Kinh doanh'],
         ['Gia đình', 'gd,giadinh', 'Gia đình'], ['Cá nhân', 'cn,canhan', 'Cá nhân lặt vặt'],
         ['Thi quỹ', 'thiquy,ftmo', 'Phí thi quỹ'], ['Chưa rõ', 'churo,khongro', 'Tiền mặt chưa rõ']],
  kenh: [['Shopee', 'sp,shopee'], ['Web', 'web,site'], ['TikTok', 'tt,tiktok'], ['Lazada', 'lz,lazada'], ['Ngoài sàn', 'ngoai,offline,zalo']],
  thu: [['Doanh thu', 'dt,doanhthu,ban,banhang'], ['Phí thu từ thợ', 'phitho,phithutho,tho'], ['Thu khác', 'thukhac,khac'],
        ['Chênh lệch chưa giải thích', 'chenhlech']],
  chi: [['Quảng cáo', 'qc,ads,quangcao,fb,facebook'], ['Nhập hàng', 'nhap,nhaphang'], ['Vận chuyển', 'ship,vanchuyen,giaohang,vc'],
        ['Phí sàn', 'phisan,fee'], ['Nhân sự', 'nhansu,luong,ns'], ['Hệ thống', 'hethong,hosting,domain,tenmien,phanmem'],
        ['Thuế - Kế toán', 'thue,ketoan,kt'],
        ['Ăn uống', 'an,anuong,cafe,caphe'], ['Đi chợ - Siêu thị', 'cho,dicho,sieuthi'], ['Đi lại - Xăng', 'xang,dilai,grab,xe'],
        ['Nhà - Điện nước', 'nha,dien,nuoc,dienuoc'], ['Con cái', 'con,concai,hoc'], ['Sức khỏe', 'suckhoe,thuoc,yte'],
        ['Giải trí', 'giaitri,choi'], ['Mua sắm', 'muasam,mua'], ['Phí thi quỹ', 'phithiquy,challenge,reset'],
        ['Chênh lệch chưa giải thích', 'chenhlech'], ['Chi khác', 'chikhac,khac']],
  settings: [
    ['NGUONG_QC_PCT', 20, 'Cảnh báo khi Quảng cáo > x% tổng Thu (lũy kế tháng, theo dự án kinh doanh)'],
    ['NGUONG_NHAPHANG_PCT', 70, 'Cảnh báo khi Nhập hàng > x% tổng Thu (lũy kế tháng, theo dự án kinh doanh)'],
    ['NGAY_KHONG_THU', 3, 'Cảnh báo dự án kinh doanh từng có thu nhưng x ngày liền không có khoản thu nào'],
    ['VI_MAC_DINH', 'Ngân hàng', 'Ví dùng khi lệnh /thu /chi không ghi ví (phải trùng tên ví ở cột U)']
  ],
  partners: [['Giao Hàng Nhanh', 'ghn', 'Vận chuyển'], ['Shopee Express', 'spx', 'Vận chuyển'], ['ShipXanh', 'shipxanh,sx', 'Kho / Vận chuyển'],
             ['1688', '1688', 'Nhà cung cấp'], ['VipoMall', 'vipo,vipomall', 'Nhà cung cấp'],
             ['Sàn Shopee', 'sanshopee', 'Sàn TMĐT'], ['Sàn TikTok Shop', 'santiktok', 'Sàn TMĐT'], ['Sàn Lazada', 'sanlazada', 'Sàn TMĐT']],
  vi: [['Tiền mặt', 'tm,tienmat', 'Thường', 0], ['Ngân hàng', 'nh,bank,nganhang,mb', 'Thường', 0], ['Tiết kiệm', 'tk,tietkiem,dedanh', 'Tiết kiệm', 0]]
};

/* =============================================================
 *  1. TIỆN ÍCH THUẦN (không phụ thuộc Google) – có kiemTra()
 * ============================================================= */
function norm_(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function fmt_(n) { n = Math.round(n); const neg = n < 0; const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (neg ? '-' : '') + s; }
function fmtS_(n) { n = Math.round(n); return (n > 0 ? '+' : '') + fmt_(n); }
function pct_(a, b) { return b > 0 ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '—'; }
function num_(v, def) { const n = Number(v); return isFinite(n) && v !== '' && v != null ? n : def; }

function keyToUtc_(key) { const p = key.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function utcToKey_(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate()); }
function addDays_(key, n) { return utcToKey_(keyToUtc_(key) + n * 86400000); }
function dow_(key) { return new Date(keyToUtc_(key)).getUTCDay(); }
function vnDate_(key) { const p = key.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function weekdayName_(key) { return WEEKDAYS[dow_(key)]; }
function isValidYmd_(y, m, d) { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
function monthStart_(key) { return key.slice(0, 8) + '01'; }
function monthEnd_(key) { const y = +key.slice(0, 4), m = +key.slice(5, 7); return utcToKey_(Date.UTC(y, m, 0)); }
function weekStart_(key) { return addDays_(key, -((dow_(key) + 6) % 7)); } // thứ Hai
function monthLabel_(key) { return key.slice(5, 7) + '/' + key.slice(0, 4); }

function parseAmount_(tok) {
  let s = String(tok).trim().toLowerCase().replace(/(vnđ|vnd|đ)$/, '').replace(/^\+/, '');
  const m = s.match(/^(\d+(?:[.,]\d+)?)(k|tr|m|ty|tỷ|ti|tỉ)(\d+)?$/);
  if (m) {
    const unit = { k: 1e3, tr: 1e6, m: 1e6, ty: 1e9, 'tỷ': 1e9, ti: 1e9, 'tỉ': 1e9 }[m[2]];
    let base = parseFloat(m[1].replace(',', '.'));
    if (m[3]) {
      if (/[.,]/.test(m[1])) return NaN;
      base = base + parseInt(m[3], 10) / Math.pow(10, m[3].length);
    }
    const v = Math.round(base * unit);
    return v > 0 ? v : NaN;
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
  if (/^\d+$/.test(s)) { const v = parseInt(s, 10); return v >= 1000 ? v : NaN; }
  return NaN;
}

function parseDateTok_(tok, todayKey) {
  const n = norm_(tok);
  if (n === 'homqua' || n === 'hqua') return addDays_(todayKey, -1);
  if (n === 'homnay' || n === 'hnay') return todayKey;
  const m = String(tok).match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  let y = m[3] ? +m[3] : +todayKey.slice(0, 4);
  if (y < 100) y += 2000;
  if (!isValidYmd_(y, +m[2], +m[1])) return null;
  return y + '-' + pad2_(+m[2]) + '-' + pad2_(+m[1]);
}

function cfgFromTables_(t) {
  const cfg = { projects: [], channels: [], catsTHU: [], catsCHI: [], partners: [], wallets: [], groups: [], groupOf: {}, walletInfo: {},
    settings: {}, settingsRaw: {}, maps: { project: {}, channel: {}, THU: {}, CHI: {}, partner: {}, wallet: {} }, cashWallet: null, defaultWallet: null };
  const add = (list, map, name, alias) => {
    name = String(name == null ? '' : name).trim();
    if (!name) return null;
    list.push(name);
    map[norm_(name)] = name;
    String(alias == null ? '' : alias).split(',').forEach(a => { const k = norm_(a); if (k && !map[k]) map[k] = name; });
    return name;
  };
  (t.duan || []).forEach(r => {
    const n = add(cfg.projects, cfg.maps.project, r[0], r[1]);
    if (n) { const g = String(r[2] || '').trim() || 'Chưa phân nhóm'; cfg.groupOf[n] = g; if (cfg.groups.indexOf(g) < 0) cfg.groups.push(g); }
  });
  (t.kenh || []).forEach(r => add(cfg.channels, cfg.maps.channel, r[0], r[1]));
  (t.thu || []).forEach(r => add(cfg.catsTHU, cfg.maps.THU, r[0], r[1]));
  (t.chi || []).forEach(r => add(cfg.catsCHI, cfg.maps.CHI, r[0], r[1]));
  (t.partners || []).forEach(r => add(cfg.partners, cfg.maps.partner, r[0], r[1]));
  (t.vi || []).forEach(r => {
    const n = add(cfg.wallets, cfg.maps.wallet, r[0], r[1]);
    if (n) cfg.walletInfo[n] = { saving: norm_(r[2]).indexOf('tietkiem') >= 0, opening: num_(r[3], 0) };
  });
  (t.settings || []).forEach(r => { if (r[0]) { const k = String(r[0]).trim(); cfg.settings[k] = Number(r[1]); cfg.settingsRaw[k] = r[1]; } });
  cfg.cashWallet = cfg.wallets.filter(w => norm_(w) === 'tienmat')[0] || null;
  const dw = cfg.maps.wallet[norm_(cfg.settingsRaw.VI_MAC_DINH)];
  cfg.defaultWallet = dw || cfg.wallets.filter(w => norm_(w) === 'nganhang')[0] || cfg.wallets[0] || null;
  return cfg;
}

/** Phân tích 1 dòng nhập: THU / CHI / CHUYEN. Trả {entry, errs}. Chặt chẽ: sai là báo lỗi, KHÔNG ghi.
 *  opts.defaultWallet: ví mặc định (dùng cho /tm). opts.rut: chuyển từ ví X sang Tiền mặt. */
function parseEntry_(type, argText, cfg, todayKey, opts) {
  opts = opts || {};
  const isTr = type === 'CHUYEN';
  const toks = String(argText || '').match(/"[^"]*"|“[^”]*”|\S+/g) || [];
  const used = new Array(toks.length).fill(false);
  const errs = [];
  const note = [];
  const wallets = [];
  let amount = null, project = null, channel = null, category = null, partner = '', dateKey = null;
  const catMap = cfg.maps[type] || {};

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^["“]/.test(t)) { note.push(t.replace(/^["“]|["”]$/g, '')); used[i] = true; continue; }
    if (t.charAt(0) === '#' && t.length > 1) {
      const raw = t.slice(1).replace(/_/g, ' ');
      partner = cfg.maps.partner[norm_(raw)] || raw;
      used[i] = true; continue;
    }
    const d = parseDateTok_(t, todayKey);
    if (d) { dateKey = d; used[i] = true; continue; }
    const a = parseAmount_(t);
    if (!isNaN(a)) {
      if (amount !== null) errs.push('Có 2 số tiền (' + fmt_(amount) + ' và ' + fmt_(a) + '). Chỉ nhập 1 số tiền mỗi lệnh.');
      else amount = a;
      used[i] = true;
    }
  }

  for (let i = 0; i < toks.length;) {
    if (used[i]) { i++; continue; }
    let matched = false;
    for (let len = 3; len >= 1 && !matched; len--) {
      if (i + len > toks.length) continue;
      let free = true;
      for (let j = i; j < i + len; j++) if (used[j]) free = false;
      if (!free) continue;
      const key = norm_(toks.slice(i, i + len).join(''));
      if (!key) continue;
      let hit;
      if (!isTr && (hit = cfg.maps.project[key])) {
        if (project && project !== hit) errs.push('Có 2 dự án (' + project + ' và ' + hit + ').');
        project = hit;
      } else if (!isTr && (hit = cfg.maps.channel[key])) {
        if (channel && channel !== hit) errs.push('Có 2 kênh (' + channel + ' và ' + hit + ').');
        channel = hit;
      } else if ((hit = cfg.maps.wallet[key])) {
        wallets.push(hit);
      } else if (!isTr && (hit = catMap[key])) {
        if (category && category !== hit) errs.push('Có 2 danh mục (' + category + ' và ' + hit + ').');
        category = hit;
      } else continue;
      for (let j = i; j < i + len; j++) used[j] = true;
      i += len; matched = true;
    }
    if (!matched) {
      if (/^\d/.test(toks[i])) errs.push('Không hiểu "' + toks[i] + '". Số tiền ghi như 350k, 1.2tr, 1500000; ngày ghi 19/11.');
      else note.push(toks[i]);
      used[i] = true; i++;
    }
  }

  if (amount === null && !errs.length) errs.push('Thiếu số tiền (ví dụ 350k, 1.2tr, 1.500.000). Số dưới 1.000 phải ghi rõ, ví dụ 350k.');
  if (!dateKey) dateKey = todayKey;
  if (dateKey > addDays_(todayKey, 1)) errs.push('Ngày ' + vnDate_(dateKey) + ' ở tương lai.');

  if (isTr) {
    let from, to;
    if (opts.rut) {
      if (!cfg.cashWallet) errs.push('Chưa có ví "Tiền mặt" trong tab CauHinh.');
      to = cfg.cashWallet; from = wallets[0] || cfg.defaultWallet;
      if (wallets.length > 1) errs.push('/rut chỉ cần ví nguồn, ví dụ: /rut 500k nh');
    } else {
      if (wallets.length !== 2) errs.push('Cần đúng 2 ví (từ → đến), ví dụ: /chuyen 5tr nh tk. Ví hiện có: ' + cfg.wallets.join(' / ') + '.');
      from = wallets[0]; to = wallets[1];
    }
    if (from && to && from === to) errs.push('Ví nguồn và ví đến trùng nhau.');
    return { errs: errs, entry: { type: 'CHUYEN', amount: amount, project: '', channel: '', category: '', partner: partner, note: note.join(' '), dateKey: dateKey, wallet: from, to: to } };
  }

  if (!project) errs.push('Thiếu dự án: ' + cfg.projects.join(' / ') + '.');
  const uniq = wallets.filter((w, i) => wallets.indexOf(w) === i);
  if (uniq.length > 1) errs.push('Có 2 ví (' + uniq.join(' và ') + '). Mỗi dòng thu/chi chỉ 1 ví; chuyển giữa ví dùng /chuyen.');
  const wallet = uniq[0] || opts.defaultWallet || cfg.defaultWallet;
  if (!wallet) errs.push('Chưa có ví nào trong tab CauHinh.');
  if (!category) {
    if (type === 'THU') category = cfg.catsTHU[0];
    else if (project && DEFAULT_CAT_BY_PROJECT[norm_(project)]) category = findCat_(cfg.catsCHI, DEFAULT_CAT_BY_PROJECT[norm_(project)]);
    if (!category && type === 'CHI') errs.push('Thiếu danh mục chi: ' + cfg.catsCHI.join(' / ') + '.');
  }
  return { errs: errs, entry: { type: type, amount: amount, project: project, channel: channel || '', category: category, partner: partner, note: note.join(' '), dateKey: dateKey, wallet: wallet, to: '' } };
}

/** /sodu <ví> <số tiền thực tế> */
function parseSodu_(args, cfg) {
  const toks = String(args || '').match(/\S+/g) || [];
  let wallet = null, amount = null;
  const errs = [];
  for (let i = 0; i < toks.length; i++) {
    const a = norm_(toks[i]);
    if (cfg.maps.wallet[a]) { wallet = cfg.maps.wallet[a]; continue; }
    if (i + 1 < toks.length && cfg.maps.wallet[norm_(toks[i] + toks[i + 1])]) { wallet = cfg.maps.wallet[norm_(toks[i] + toks[i + 1])]; i++; continue; }
    if (/^0+$/.test(toks[i])) { amount = 0; continue; }
    const v = parseAmount_(toks[i]);
    if (isNaN(v)) errs.push('Không hiểu "' + toks[i] + '".'); else amount = v;
  }
  if (!wallet) errs.push('Thiếu ví: ' + cfg.wallets.join(' / ') + '.');
  if (amount === null) errs.push('Thiếu số dư thực tế (ví dụ 12.340.000 hoặc 0).');
  return { errs: errs, wallet: wallet, amount: amount };
}

/** Số dư từng ví = đầu kỳ + thu − chi − chuyển đi + chuyển đến (toàn bộ sổ cái). */
function balances_(rows, cfg) {
  const b = {};
  cfg.wallets.forEach(w => { b[w] = cfg.walletInfo[w].opening; });
  rows.forEach(r => {
    if (r.type === 'CHUYEN') {
      if (b[r.wallet] !== undefined) b[r.wallet] -= r.amount;
      if (b[r.to] !== undefined) b[r.to] += r.amount;
    } else if (b[r.wallet] !== undefined) {
      b[r.wallet] += r.type === 'THU' ? r.amount : -r.amount;
    }
  });
  return b;
}

/** Gộp thu/chi (không tính CHUYEN) theo khoảng ngày (khóa yyyy-mm-dd, gồm cả 2 đầu). */
function summarize_(rows, fromKey, toKey) {
  const s = { thu: 0, chi: 0, n: 0, byProject: {}, chiCat: {}, thuCat: {}, thuChannel: {}, chiPartner: {} };
  rows.forEach(r => {
    if (r.type === 'CHUYEN' || r.dateKey < fromKey || r.dateKey > toKey) return;
    const p = r.knownProject ? r.project : '⚠ Không rõ';
    const d = s.byProject[p] || (s.byProject[p] = { thu: 0, chi: 0, chiCat: {}, thuCat: {} });
    s.n++;
    if (r.type === 'THU') {
      s.thu += r.amount; d.thu += r.amount;
      s.thuCat[r.cat] = (s.thuCat[r.cat] || 0) + r.amount; d.thuCat[r.cat] = (d.thuCat[r.cat] || 0) + r.amount;
      const ch = r.channel || '(không ghi kênh)';
      s.thuChannel[ch] = (s.thuChannel[ch] || 0) + r.amount;
    } else {
      s.chi += r.amount; d.chi += r.amount;
      s.chiCat[r.cat] = (s.chiCat[r.cat] || 0) + r.amount; d.chiCat[r.cat] = (d.chiCat[r.cat] || 0) + r.amount;
      if (r.partner) s.chiPartner[r.partner] = (s.chiPartner[r.partner] || 0) + r.amount;
    }
  });
  return s;
}

/** Dòng tiền theo NHÓM + tiết kiệm + tiền mặt (cho /tien). */
function moneyFlow_(rows, cfg, from, to) {
  const f = { thu: 0, chi: 0, thuGroup: {}, chiGroup: {}, lech: 0, savingIn: 0, savingOut: 0, cashOut: 0, cashSpent: 0 };
  const lechCat = findCat_(cfg.catsCHI, 'chenhlechchuagiaithich');
  const sv = w => !!(cfg.walletInfo[w] && cfg.walletInfo[w].saving);
  rows.forEach(r => {
    if (r.dateKey < from || r.dateKey > to) return;
    if (r.type === 'CHUYEN') {
      if (sv(r.to) && !sv(r.wallet)) f.savingIn += r.amount;
      if (sv(r.wallet) && !sv(r.to)) f.savingOut += r.amount;
      if (cfg.cashWallet && r.to === cfg.cashWallet && r.wallet !== cfg.cashWallet) f.cashOut += r.amount;
      return;
    }
    const g = (r.knownProject && cfg.groupOf[r.project]) || 'Chưa phân nhóm';
    if (r.type === 'THU') { f.thu += r.amount; f.thuGroup[g] = (f.thuGroup[g] || 0) + r.amount; }
    else {
      f.chi += r.amount; f.chiGroup[g] = (f.chiGroup[g] || 0) + r.amount;
      if (r.cat === lechCat) f.lech += r.amount;
      else if (cfg.cashWallet && r.wallet === cfg.cashWallet) f.cashSpent += r.amount;
    }
  });
  return f;
}

function sortedDesc_(obj) { return Object.keys(obj).map(k => [k, obj[k]]).sort((a, b) => b[1] - a[1]); }
function unclearProject_(cfg) { return cfg.projects.filter(x => norm_(x) === 'chuaro')[0] || null; }
function findCat_(list, normKey) { for (let i = 0; i < list.length; i++) if (norm_(list[i]) === normKey) return list[i]; return null; }
function projectOrder_(cfg, s) {
  const extra = Object.keys(s.byProject).filter(p => cfg.projects.indexOf(p) < 0);
  return cfg.projects.concat(extra).filter(p => s.byProject[p]);
}
function negWalletWarnings_(bal) {
  return Object.keys(bal).filter(w => bal[w] < 0).map(w => '⚠️ Ví ' + w + ' đang âm ' + fmt_(bal[w]) + ': có khoản chi/chuyển chưa ghi nguồn tiền (thiếu /rut hoặc /thu). Kiểm tra bằng /sodu.');
}

/** Gợi ý cải tiến bằng LUẬT CỐ ĐỊNH (ngưỡng ở tab CauHinh) – chỉ áp dụng cho dự án thuộc nhóm Kinh doanh. */
function suggestions_(rows, cfg, todayKey) {
  const S = cfg.settings, out = [];
  const qcMax = num_(S.NGUONG_QC_PCT, 20), nhMax = num_(S.NGUONG_NHAPHANG_PCT, 70), ngayKT = num_(S.NGAY_KHONG_THU, 3);
  const m = summarize_(rows, monthStart_(todayKey), todayKey);
  const qcName = findCat_(cfg.catsCHI, 'quangcao'), nhName = findCat_(cfg.catsCHI, 'nhaphang');
  cfg.projects.forEach(p => {
    if (cfg.groupOf[p] !== G_BUSINESS) return;
    const d = m.byProject[p];
    if (d) {
      const qc = qcName ? (d.chiCat[qcName] || 0) : 0, nh = nhName ? (d.chiCat[nhName] || 0) : 0;
      if (qc > 0 && d.thu === 0) out.push('⚠️ ' + p + ': có chi quảng cáo ' + fmt_(qc) + ' nhưng tháng này chưa có khoản thu nào. Kiểm tra chiến dịch/đơn hàng.');
      else if (d.thu > 0 && qc / d.thu * 100 > qcMax) out.push('💡 ' + p + ': quảng cáo = ' + pct_(qc, d.thu) + ' tổng thu tháng (ngưỡng ' + qcMax + '%). Rà lại chiến dịch kém hiệu quả, giảm ngân sách hoặc nâng biên lãi.');
      if (d.thu > 0 && nh / d.thu * 100 > nhMax) out.push('💡 ' + p + ': nhập hàng = ' + pct_(nh, d.thu) + ' tổng thu tháng (ngưỡng ' + nhMax + '%). Xem lại giá nhập hoặc giá bán.');
      if (d.chi > d.thu && d.chi > 0) out.push('⚠️ ' + p + ': chi vượt thu ' + fmt_(d.chi - d.thu) + ' trong tháng.');
    }
    const last30 = summarize_(rows, addDays_(todayKey, -30), todayKey).byProject[p];
    const lastN = summarize_(rows, addDays_(todayKey, -(ngayKT - 1)), todayKey).byProject[p];
    if (last30 && last30.thu > 0 && (!lastN || lastN.thu === 0)) out.push('⚠️ ' + p + ': ' + ngayKT + ' ngày liền không có khoản thu nào (30 ngày qua vẫn có thu).');
  });
  return out.slice(0, 6);
}

/* =============================================================
 *  2. BÁO CÁO (trả về HTML cho Telegram)
 * ============================================================= */
function projectBlock_(cfg, s, withQc) {
  const L = [];
  const qcName = findCat_(cfg.catsCHI, 'quangcao');
  projectOrder_(cfg, s).forEach(p => {
    const d = s.byProject[p];
    let line = '• <b>' + esc_(p) + '</b>: thu ' + fmt_(d.thu) + ' · chi ' + fmt_(d.chi) + ' · chênh ' + fmtS_(d.thu - d.chi);
    if (withQc && qcName && cfg.groupOf[p] === G_BUSINESS && (d.chiCat[qcName] || 0) > 0) line += ' · QC ' + pct_(d.chiCat[qcName], d.thu);
    L.push(line);
  });
  return L;
}
function chiCatLines_(s) { return sortedDesc_(s.chiCat).map(e => '   · ' + esc_(e[0]) + ': ' + fmt_(e[1])); }

function reportDay_(rows, cfg, key, extra) {
  const s = summarize_(rows, key, key);
  const m = summarize_(rows, monthStart_(key), key);
  const qcName = findCat_(cfg.catsCHI, 'quangcao');
  const L = ['📊 <b>MEC GROUP · ' + weekdayName_(key) + ' ' + vnDate_(key) + '</b>', ''];
  if (!s.n) {
    L.push('Hôm nay chưa ghi giao dịch nào. Nếu có thu/chi, nhập bằng /thu, /chi hoặc /tm.');
  } else {
    L.push('Thu: <b>' + fmt_(s.thu) + '</b>');
    L.push('Chi: <b>' + fmt_(s.chi) + '</b>');
    chiCatLines_(s).forEach(x => L.push(x));
    L.push('Chênh lệch: <b>' + fmtS_(s.thu - s.chi) + '</b>');
    L.push('');
    projectBlock_(cfg, s, true).forEach(x => L.push(x));
  }
  L.push('');
  L.push('<b>Lũy kế tháng ' + monthLabel_(key) + '</b>');
  L.push('Thu ' + fmt_(m.thu) + ' · Chi ' + fmt_(m.chi) + ' · Chênh <b>' + fmtS_(m.thu - m.chi) + '</b>');
  if (qcName && (m.chiCat[qcName] || 0) > 0) L.push('Quảng cáo / thu: ' + pct_(m.chiCat[qcName], m.thu));
  const sg = suggestions_(rows, cfg, key);
  if (sg.length) { L.push(''); sg.forEach(x => L.push(esc_(x))); }
  if (extra && extra.length) { L.push(''); extra.forEach(x => L.push(esc_(x))); }
  return L.join('\n');
}

function reportWeek_(rows, cfg, key) {
  const from = weekStart_(key);
  const s = summarize_(rows, from, key);
  const span = (keyToUtc_(key) - keyToUtc_(from)) / 86400000;
  const pFrom = addDays_(from, -7), pTo = addDays_(pFrom, span);
  const p = summarize_(rows, pFrom, pTo);
  const L = ['🗓 <b>TUẦN ' + vnDate_(from) + ' → ' + vnDate_(key) + '</b>', ''];
  L.push('Thu: <b>' + fmt_(s.thu) + '</b> (tuần trước cùng kỳ ' + fmt_(p.thu) + ', ' + fmtS_(s.thu - p.thu) + ')');
  L.push('Chi: <b>' + fmt_(s.chi) + '</b> (tuần trước ' + fmt_(p.chi) + ', ' + fmtS_(s.chi - p.chi) + ')');
  chiCatLines_(s).forEach(x => L.push(x));
  L.push('Chênh lệch: <b>' + fmtS_(s.thu - s.chi) + '</b> (tuần trước ' + fmtS_(p.thu - p.chi) + ')');
  L.push('');
  projectBlock_(cfg, s, true).forEach(x => L.push(x));
  const sg = suggestions_(rows, cfg, key);
  L.push('');
  if (sg.length) sg.forEach(x => L.push(esc_(x))); else L.push('✅ Chưa có chỉ số nào vượt ngưỡng cảnh báo.');
  return L.join('\n');
}

function reportMonth_(rows, cfg, anyKeyInMonth, todayKey) {
  const from = monthStart_(anyKeyInMonth), to = monthEnd_(anyKeyInMonth);
  const s = summarize_(rows, from, to);
  const qcName = findCat_(cfg.catsCHI, 'quangcao');
  const L = ['📅 <b>THÁNG ' + monthLabel_(from) + '</b>', ''];
  L.push('Thu: <b>' + fmt_(s.thu) + '</b>');
  L.push('Chi: <b>' + fmt_(s.chi) + '</b>');
  chiCatLines_(s).forEach(x => L.push(x));
  L.push('Chênh lệch: <b>' + fmtS_(s.thu - s.chi) + '</b>');
  if (qcName && (s.chiCat[qcName] || 0) > 0) L.push('Quảng cáo / thu: ' + pct_(s.chiCat[qcName], s.thu));
  L.push('');
  projectBlock_(cfg, s, true).forEach(x => L.push(x));
  const ch = sortedDesc_(s.thuChannel);
  if (ch.length) { L.push(''); L.push('<b>Thu theo kênh</b>'); ch.forEach(e => L.push('   · ' + esc_(e[0]) + ': ' + fmt_(e[1]))); }
  const pt = sortedDesc_(s.chiPartner).slice(0, 5);
  if (pt.length) { L.push(''); L.push('<b>Chi theo đối tác (top 5)</b>'); pt.forEach(e => L.push('   · ' + esc_(e[0]) + ': ' + fmt_(e[1]))); }
  if (todayKey && todayKey >= from && todayKey <= to) {
    const sg = suggestions_(rows, cfg, todayKey);
    if (sg.length) { L.push(''); sg.forEach(x => L.push(esc_(x))); }
  }
  return L.join('\n');
}

function walletLines_(cfg, bal) {
  return cfg.wallets.map(w => '   · ' + esc_(w) + ': <b>' + fmt_(bal[w]) + '</b>' + (cfg.walletInfo[w].saving ? ' (để dành)' : ''));
}

/** /tien – tiền đi đâu trong tháng (công ty + cá nhân), theo NHÓM. */
function reportMoney_(rows, cfg, anyKeyInMonth) {
  const from = monthStart_(anyKeyInMonth), to = monthEnd_(anyKeyInMonth);
  const f = moneyFlow_(rows, cfg, from, to);
  const bal = balances_(rows, cfg);
  const L = ['💰 <b>TIỀN ĐI ĐÂU · tháng ' + monthLabel_(from) + '</b>', ''];
  L.push('Vào: <b>' + fmt_(f.thu) + '</b>');
  sortedDesc_(f.thuGroup).forEach(e => L.push('   · ' + esc_(e[0]) + ': ' + fmt_(e[1])));
  L.push('Ra: <b>' + fmt_(f.chi) + '</b>');
  sortedDesc_(f.chiGroup).forEach(e => L.push('   · ' + esc_(e[0]) + ': ' + fmt_(e[1]) + '  (' + pct_(e[1], f.chi) + ')'));
  if (f.lech > 0) L.push('   ⚠️ trong đó chênh lệch chưa giải thích: ' + fmt_(f.lech));
  L.push('Vào − Ra: <b>' + fmtS_(f.thu - f.chi) + '</b>');
  const saved = f.savingIn - f.savingOut;
  L.push('');
  L.push('Để dành (chuyển vào ví tiết kiệm): <b>' + fmtS_(saved) + '</b>' + (f.thu > 0 ? ' (' + pct_(saved, f.thu) + ' của tiền vào)' : ''));
  if (cfg.cashWallet) L.push('Tiền mặt: đã rút ' + fmt_(f.cashOut) + ' · đã ghi tiêu ' + fmt_(f.cashSpent) + ' · còn theo sổ ' + fmt_(bal[cfg.cashWallet]));
  L.push('');
  L.push('<b>Số dư các ví hiện tại</b>');
  walletLines_(cfg, bal).forEach(x => L.push(x));
  const latvat = (f.chiGroup[G_LATVAT] || 0) + (f.chiGroup[G_UNCLEAR] || 0);
  const tips = [];
  if (latvat > 0) tips.push('💡 Cá nhân lặt vặt + tiền mặt chưa rõ = ' + fmt_(latvat) + (saved > 0 ? ', gấp ' + (latvat / saved).toFixed(1).replace('.', ',') + ' lần số để dành.' : ', trong khi tháng này chưa để dành được đồng nào.'));
  if (f.chi > f.thu && f.chi > 0) tips.push('⚠️ Tháng này ra nhiều hơn vào ' + fmt_(f.chi - f.thu) + ' (đang lấy từ số dư cũ).');
  negWalletWarnings_(bal).forEach(x => tips.push(x));
  if (tips.length) { L.push(''); tips.forEach(x => L.push(esc_(x))); }
  return L.join('\n');
}

/* =============================================================
 *  3. ĐỌC / GHI GOOGLE SHEET
 * ============================================================= */
function todayKey_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'); }
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Thiếu tab "' + name + '". Hãy chạy hàm setup() trước.');
  return sh;
}

function loadConfig_() {
  const sh = sheet_(TAB.CAUHINH);
  const last = Math.max(sh.getLastRow(), 2);
  const v = sh.getRange(2, 1, last - 1, 24).getValues();
  const t = { duan: [], kenh: [], thu: [], chi: [], partners: [], settings: [], vi: [] };
  v.forEach(r => {
    if (r[0]) t.duan.push([r[0], r[1], r[2]]);
    if (r[3]) t.kenh.push([r[3], r[4]]);
    if (r[6]) t.thu.push([r[6], r[7]]);
    if (r[9]) t.chi.push([r[9], r[10]]);
    if (r[12]) t.settings.push([r[12], r[13]]);
    if (r[16]) t.partners.push([r[16], r[17]]);
    if (r[20]) t.vi.push([r[20], r[21], r[22], r[23]]);
  });
  return cfgFromTables_(t);
}

/** Đọc toàn bộ sổ cái. rows = dòng tính được; errors = dòng lỗi. */
function readLedger_(cfg) {
  const sh = sheet_(TAB.SOCAI);
  const last = sh.getLastRow();
  const out = { rows: [], errors: [], voided: 0 };
  if (last < 2) return out;
  const vals = sh.getRange(2, 1, last - 1, NCOL).getValues();
  vals.forEach((r, i) => {
    const rowNum = i + 2;
    if (r[COL.DATE] === '' && r[COL.TYPE] === '' && r[COL.AMOUNT] === '' && r[COL.PROJECT] === '' && r[COL.CAT] === '') return;
    const typeRaw = String(r[COL.TYPE]);
    const type = typeRaw.toUpperCase();
    if (type === 'HUY' || type === 'HỦY') { out.voided++; return; }
    const issues = [];
    if (type !== 'THU' && type !== 'CHI' && type !== 'CHUYEN') issues.push('Loại phải đúng THU, CHI hoặc CHUYEN (đang là "' + typeRaw + '")');
    let dateKey = null;
    if (Object.prototype.toString.call(r[COL.DATE]) === '[object Date]' && !isNaN(r[COL.DATE].getTime())) dateKey = Utilities.formatDate(r[COL.DATE], CONFIG.TZ, 'yyyy-MM-dd');
    else issues.push('Ngày không hợp lệ');
    const amount = r[COL.AMOUNT];
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) issues.push('Số tiền phải là số dương');
    if (issues.length) { out.errors.push({ row: rowNum, issues: issues }); return; }
    const wallet = String(r[COL.WALLET] || '');
    if (type === 'CHUYEN') {
      const to = String(r[COL.TO] || ''), si = [];
      if (cfg.wallets.indexOf(wallet) < 0) si.push('Ví nguồn thiếu/lạ "' + wallet + '"');
      if (cfg.wallets.indexOf(to) < 0) si.push('Ví đến thiếu/lạ "' + to + '"');
      if (wallet && wallet === to) si.push('Ví nguồn và ví đến trùng nhau');
      if (si.length) { out.errors.push({ row: rowNum, issues: si }); return; }
      out.rows.push({ row: rowNum, id: r[COL.ID], dateKey: dateKey, project: '', channel: '', type: 'CHUYEN', cat: '', amount: amount, partner: String(r[COL.PARTNER] || ''), note: String(r[COL.NOTE] || ''), knownProject: true, wallet: wallet, to: to });
      return;
    }
    const project = String(r[COL.PROJECT]), cat = String(r[COL.CAT]), channel = String(r[COL.CHANNEL] || '');
    const knownProject = cfg.projects.indexOf(project) >= 0;
    const knownCat = (type === 'THU' ? cfg.catsTHU : cfg.catsCHI).indexOf(cat) >= 0;
    const soft = [];
    if (!knownProject) soft.push('Dự án lạ "' + project + '"');
    if (!knownCat) soft.push('Danh mục lạ "' + cat + '" cho loại ' + type);
    if (channel && cfg.channels.indexOf(channel) < 0) soft.push('Kênh lạ "' + channel + '"');
    if (!wallet) soft.push('Thiếu ví (cột M)'); else if (cfg.wallets.indexOf(wallet) < 0) soft.push('Ví lạ "' + wallet + '"');
    if (soft.length) out.errors.push({ row: rowNum, issues: soft });
    out.rows.push({ row: rowNum, id: r[COL.ID], dateKey: dateKey, project: project, channel: channel, type: type, cat: cat, amount: amount, partner: String(r[COL.PARTNER] || ''), note: String(r[COL.NOTE] || ''), knownProject: knownProject, wallet: wallet, to: '' });
  });
  return out;
}

function appendEntry_(entry, who, source) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(TAB.SOCAI);
    const last = sh.getLastRow();
    let maxId = 0;
    if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(r => { const n = Number(r[0]); if (isFinite(n) && n > maxId) maxId = n; });
    const id = maxId + 1;
    const date = Utilities.parseDate(entry.dateKey + ' 12:00', CONFIG.TZ, 'yyyy-MM-dd HH:mm');
    sh.getRange(last + 1, 1, 1, NCOL).setValues([[id, date, entry.project, entry.channel || '', entry.type, entry.category, entry.amount, entry.partner || '', entry.note || '', source, new Date(), who, entry.wallet || '', entry.to || '']]);
    SpreadsheetApp.flush();
    return id;
  } finally { lock.releaseLock(); }
}

function voidRow_(rowNum, who) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(TAB.SOCAI);
    const note = sh.getRange(rowNum, COL.NOTE + 1);
    note.setValue((String(note.getValue() || '') + ' [HỦY bởi ' + who + ' ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM HH:mm') + ']').trim());
    sh.getRange(rowNum, COL.TYPE + 1).setValue('HUY');
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function findRowById_(id) {
  const sh = sheet_(TAB.SOCAI);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) if (Number(ids[i][0]) === id) return i + 2;
  return 0;
}

function describeRow_(rowNum) {
  const r = sheet_(TAB.SOCAI).getRange(rowNum, 1, 1, NCOL).getValues()[0];
  const d = Object.prototype.toString.call(r[COL.DATE]) === '[object Date]' ? vnDate_(Utilities.formatDate(r[COL.DATE], CONFIG.TZ, 'yyyy-MM-dd')) : String(r[COL.DATE]);
  const amt = typeof r[COL.AMOUNT] === 'number' ? fmt_(r[COL.AMOUNT]) : r[COL.AMOUNT];
  let s = '#' + r[COL.ID] + ' ' + d + ' ' + r[COL.TYPE] + ' ' + amt;
  if (String(r[COL.TYPE]).toUpperCase() === 'CHUYEN') s += ' · ' + r[COL.WALLET] + ' → ' + r[COL.TO];
  else s += ' · ' + r[COL.PROJECT] + ' · ' + r[COL.CAT] + (r[COL.CHANNEL] ? ' · ' + r[COL.CHANNEL] : '') + (r[COL.WALLET] ? ' · ví ' + r[COL.WALLET] : '');
  return s + (r[COL.PARTNER] ? ' · #' + r[COL.PARTNER] : '') + (r[COL.NOTE] ? ' · ' + r[COL.NOTE] : '');
}

/** Dùng 1 lần sau khi nâng cấp từ bản 1: gán ví mặc định cho các dòng thu/chi cũ chưa có ví. */
function ganViMacDinh() {
  const cfg = loadConfig_();
  if (!cfg.defaultWallet) throw new Error('Chưa có ví mặc định trong CauHinh.');
  const sh = sheet_(TAB.SOCAI), last = sh.getLastRow();
  if (last < 2) return;
  const v = sh.getRange(2, 1, last - 1, NCOL).getValues();
  let n = 0;
  v.forEach((r, i) => {
    const t = String(r[COL.TYPE]).toUpperCase();
    if ((t === 'THU' || t === 'CHI') && !r[COL.WALLET] && r[COL.AMOUNT] !== '') { sh.getRange(i + 2, COL.WALLET + 1).setValue(cfg.defaultWallet); n++; }
  });
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Đã gán ví "' + cfg.defaultWallet + '" cho ' + n + ' dòng cũ.', 'MEC Group', 6); } catch (e) { }
  Logger.log('Đã gán ví ' + cfg.defaultWallet + ' cho ' + n + ' dòng.');
}

/* =============================================================
 *  4. ĐỐI SOÁT
 * ============================================================= */
function doisoat_(cfg) {
  const led = readLedger_(cfg);
  const L = [];
  let ok = true;
  L.push('Sổ cái: ' + led.rows.length + ' dòng tính được · ' + led.voided + ' đã hủy · ' + led.errors.length + ' dòng có lỗi');
  if (led.errors.length) {
    ok = false;
    led.errors.slice(0, 10).forEach(e => L.push('  ✖ Dòng ' + e.row + ': ' + e.issues.join('; ')));
    if (led.errors.length > 10) L.push('  … và ' + (led.errors.length - 10) + ' dòng lỗi khác');
  }
  const seen = {};
  led.rows.forEach(r => {
    const k = [r.dateKey, r.project, r.type, r.cat, r.amount, r.partner, r.note, r.wallet, r.to].join('|');
    (seen[k] = seen[k] || []).push(r.row);
  });
  const dups = Object.keys(seen).filter(k => seen[k].length > 1);
  if (dups.length) L.push('  ⚠ Nghi trùng (kiểm tra, có thể hợp lệ): ' + dups.slice(0, 5).map(k => 'dòng ' + seen[k].join(' & ')).join('; '));
  try {
    SpreadsheetApp.flush();
    const bc = sheet_(TAB.BAOCAO);
    const b3 = bc.getRange('B3').getValue(), b4 = bc.getRange('B4').getValue();
    const fromKey = Utilities.formatDate(b3, CONFIG.TZ, 'yyyy-MM-dd');
    const toKey = addDays_(Utilities.formatDate(b4, CONFIG.TZ, 'yyyy-MM-dd'), -1);
    const col = bc.getRange(1, 1, bc.getLastRow(), 1).getValues();
    let totRow = 0, walRow = 0;
    for (let i = 0; i < col.length; i++) {
      const a = String(col[i][0]);
      if (!totRow && a.indexOf('TỔNG TOÀN SỔ') === 0) totRow = i + 1;
      if (!walRow && a.indexOf('SỐ DƯ CÁC VÍ') === 0) walRow = i + 1;
    }
    if (!totRow) throw new Error('không thấy dòng TỔNG TOÀN SỔ');
    const sheetThu = Number(bc.getRange(totRow, 2).getValue()), sheetChi = Number(bc.getRange(totRow, 3).getValue());
    const s = summarize_(led.rows, fromKey, toKey);
    const okThu = Math.abs(s.thu - sheetThu) < 1, okChi = Math.abs(s.chi - sheetChi) < 1;
    L.push('Tháng ' + monthLabel_(fromKey) + ' – Bot tính: thu ' + fmt_(s.thu) + ' · chi ' + fmt_(s.chi));
    L.push('Tháng ' + monthLabel_(fromKey) + ' – Bảng BaoCao: thu ' + fmt_(sheetThu) + ' · chi ' + fmt_(sheetChi));
    L.push((okThu && okChi) ? '  ✔ Thu/chi khớp' : '  ✖ Thu/chi LỆCH – kiểm tra các dòng lỗi ở trên');
    if (!(okThu && okChi)) ok = false;
    const chk = String(bc.getRange(totRow + 1, 2).getValue());
    if (chk.indexOf('LỆCH') >= 0) { L.push('  ✖ BaoCao: tổng các dự án ≠ tổng toàn sổ (có dòng sai tên dự án)'); ok = false; }
    if (walRow) {
      const bal = balances_(led.rows, cfg);
      const vals = bc.getRange(walRow + 2, 1, cfg.wallets.length, 7).getValues();
      let walOk = true;
      vals.forEach(v => {
        const mine = bal[v[0]], sb = Number(v[6]);
        if (mine === undefined || Math.abs(mine - sb) >= 1) { L.push('  ✖ Ví ' + v[0] + ': bot ' + fmt_(mine) + ' ≠ bảng ' + fmt_(sb)); walOk = false; ok = false; }
      });
      if (walOk) L.push('  ✔ Số dư các ví khớp bảng BaoCao');
    } else { L.push('  ⚠ Chưa có khối SỐ DƯ CÁC VÍ trong BaoCao (chạy menu MEC Group > Làm mới)'); ok = false; }
  } catch (e) {
    L.push('⚠️ Không đối chiếu được với tab BaoCao: ' + e.message + ' (chạy menu MEC Group > Làm mới)');
    ok = false;
  }
  L.push(ok ? '✅ SỐ LIỆU KHỚP' : '❌ CẦN KIỂM TRA');
  return { ok: ok, lines: L };
}

/* =============================================================
 *  5. TELEGRAM
 * ============================================================= */
function props_() { return PropertiesService.getScriptProperties(); }
function botToken_() { return String(props_().getProperty('BOT_TOKEN') || CONFIG.BOT_TOKEN || '').trim(); }
function pin_() { return String(props_().getProperty('PIN') || CONFIG.PIN || '').trim(); }
function getSecret_() {
  let s = props_().getProperty('SECRET');
  if (!s) { s = Utilities.getUuid().replace(/-/g, ''); props_().setProperty('SECRET', s); }
  return s;
}
function getChats_() { try { return JSON.parse(props_().getProperty('CHATS') || '[]'); } catch (e) { return []; } }
function isAllowed_(chatId) { return getChats_().indexOf(String(chatId)) >= 0; }

function send_(chatId, html) {
  const parts = [];
  let cur = '';
  String(html).split('\n').forEach(line => {
    if ((cur + '\n' + line).length > 3800) { parts.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
  });
  if (cur) parts.push(cur);
  parts.forEach(p => {
    const token = botToken_();
    if (!token) throw new Error('Chưa cài BOT_TOKEN: menu MEC Group > Cài đặt BOT_TOKEN.');
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ chat_id: chatId, text: p, parse_mode: 'HTML', disable_web_page_preview: true }) });
    if (r.getResponseCode() !== 200) {
      UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ chat_id: chatId, text: p.replace(/<[^>]+>/g, '') }) });
    }
  });
}
function broadcast_(html) { getChats_().forEach(c => send_(c, html)); }

const HELP_ = [
  '<b>MEC GROUP BOT</b>',
  '',
  '<b>Ghi thu / chi (1 dòng)</b>',
  '/thu 1.2tr SuperMall Shopee',
  '/chi 350k SuperMall QC Shopee',
  '/chi 1.5tr SuperMall NhapHang #1688 "đợt 2"',
  '/chi 2tr GiaDinh DiCho nh   (chi gia đình từ Ngân hàng)',
  '/tm 45k CaNhan AnUong       (chi bằng Tiền mặt)',
  '/chi 1tr ThiQuy nh          (phí thi quỹ)',
  '• Dự án = công ty (SuperMall, Dungo, Chung) hoặc cá nhân (GiaDinh, CaNhan, ThiQuy, ChuaRo)',
  '• Không ghi ví thì dùng ví mặc định (Ngân hàng); ví: tm, nh, tk',
  '',
  '<b>Chuyển tiền giữa các ví (KHÔNG phải chi)</b>',
  '/rut 500k nh          (rút từ Ngân hàng ra Tiền mặt)',
  '/chuyen 5tr nh tk     (gửi để dành)',
  '',
  '<b>Số dư và đối chiếu</b>',
  '/vi                   (số dư các ví theo sổ)',
  '/sodu nh 12.340.000   (khai số dư THẬT; phần lệch ghi thành "chênh lệch chưa giải thích")',
  '',
  '<b>Số tiền / ngày / ghi chú</b>',
  '350k · 1.2tr · 1tr2 · 1.500.000 (dưới 1.000 phải ghi rõ, vd 350k) · Ghi chú đặt trong "ngoặc kép"',
  'Đối tác: #ghn #1688 · Ngày khác hôm nay: thêm 18/11 hoặc hqua',
  '',
  '<b>Xem báo cáo</b>',
  '/tien (tiền đi đâu, cả công ty và cá nhân) · /homnay · /homqua · /ngay 18/11 · /tuan · /thang · /thang 10/2026',
  '',
  '<b>Sửa / kiểm tra</b>',
  '/ds 10 · /undo (hủy dòng vừa nhập) · /xoa 57 · /doisoat',
  '',
  'Tự động: báo cáo ngày 20:30; Chủ nhật thêm báo cáo tuần và /tien; ngày 1 thêm báo cáo tháng trước.'
].join('\n');

function walletBalLine_(rows, cfg, names) {
  const bal = balances_(rows, cfg);
  return names.filter(Boolean).filter((w, i, a) => a.indexOf(w) === i).map(w => 'Ví ' + esc_(w) + ': ' + fmt_(bal[w])).join(' · ');
}

function handleUpdate_(upd) {
  const msg = upd.message;
  if (!msg || !msg.text) return;
  const chatId = String(msg.chat.id);
  const who = (msg.from && (msg.from.first_name || msg.from.username)) || 'user';
  let text = msg.text.trim().replace(/^(\/\w+)@\w+/, '$1');

  const reg = text.match(/^\/dangky\s+(\S+)/i);
  if (reg) {
    if (!pin_()) { send_(chatId, '⚠️ Chưa đặt PIN. Trong Google Sheet: menu MEC Group > Cài đặt PIN.'); return; }
    if (reg[1] !== pin_()) { send_(chatId, '❌ Sai mật khẩu.'); return; }
    const chats = getChats_();
    if (chats.indexOf(chatId) < 0) { chats.push(chatId); props_().setProperty('CHATS', JSON.stringify(chats)); }
    send_(chatId, '✅ Đã đăng ký chat này nhận báo cáo.\n\n' + HELP_);
    return;
  }
  if (!isAllowed_(chatId)) { send_(chatId, '🔒 Chat chưa đăng ký. Gõ: /dangky MẬT_KHẨU'); return; }

  let cmd, args;
  let m = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (m) { cmd = m[1].toLowerCase(); args = (m[2] || '').trim(); }
  else {
    m = text.match(/^(thu|chi|tm)\s+(\d[\s\S]*)$/i);
    if (m) { cmd = m[1].toLowerCase(); args = m[2].trim(); } else { send_(chatId, 'Gõ /help để xem lệnh.'); return; }
  }

  const cfg = loadConfig_();
  const today = todayKey_();
  switch (cmd) {
    case 'start': case 'help': send_(chatId, HELP_); break;
    case 'thu': case 'chi': case 'tm': case 'rut': case 'chuyen': {
      const type = cmd === 'thu' ? 'THU' : (cmd === 'rut' || cmd === 'chuyen') ? 'CHUYEN' : 'CHI';
      const opts = {};
      if (cmd === 'tm') {
        if (!cfg.cashWallet) { send_(chatId, '❌ Chưa có ví "Tiền mặt" trong tab CauHinh.'); break; }
        opts.defaultWallet = cfg.cashWallet;
      }
      if (cmd === 'rut') opts.rut = true;
      const p = parseEntry_(type, args, cfg, today, opts);
      if (p.errs.length) { send_(chatId, '❌ ' + esc_(p.errs.join('\n❌ ')) + '\n\nVí dụ: /chi 350k SuperMall QC Shopee · /tm 45k CaNhan AnUong · /rut 500k nh · /chuyen 5tr nh tk\nGõ /help để xem hướng dẫn.'); break; }
      const id = appendEntry_(p.entry, who, 'telegram');
      const e = p.entry;
      const led = readLedger_(cfg);
      let head, line2;
      if (type === 'CHUYEN') {
        head = '🔁 <b>#' + id + ' CHUYỂN ' + fmt_(e.amount) + '</b> · ' + vnDate_(e.dateKey) + '\n' + esc_(e.wallet) + ' → ' + esc_(e.to) + (e.note ? ' · “' + esc_(e.note) + '”' : '');
        line2 = walletBalLine_(led.rows, cfg, [e.wallet, e.to]);
      } else {
        const s = summarize_(led.rows, e.dateKey, e.dateKey);
        const bits = [e.project, e.category, e.channel, '💳 ' + e.wallet, e.partner ? '#' + e.partner : '', e.note ? '“' + e.note + '”' : ''].filter(Boolean).map(esc_);
        const warn = e.amount < 10000 ? '\n⚠️ Số tiền nhỏ (' + fmt_(e.amount) + ' đ). Nếu nhầm, gõ /undo' : '';
        head = '✅ <b>#' + id + ' ' + type + ' ' + fmt_(e.amount) + '</b> · ' + vnDate_(e.dateKey) + '\n' + bits.join(' · ') + warn;
        line2 = 'Ngày ' + vnDate_(e.dateKey) + ': thu ' + fmt_(s.thu) + ' · chi ' + fmt_(s.chi) + ' · chênh ' + fmtS_(s.thu - s.chi) + '\n' + walletBalLine_(led.rows, cfg, [e.wallet]);
      }
      const neg = negWalletWarnings_(balances_(led.rows, cfg));
      send_(chatId, head + '\n' + line2 + (neg.length ? '\n' + esc_(neg[0]) : '') + '\n/undo để hủy dòng này');
      break;
    }
    case 'vi': {
      const led = readLedger_(cfg), bal = balances_(led.rows, cfg);
      send_(chatId, '<b>Số dư các ví theo sổ</b>\n' + walletLines_(cfg, bal).join('\n') + '\n\nGõ /sodu để khai số dư thật và lộ khoản chênh lệch.');
      break;
    }
    case 'sodu': {
      if (!args) { const led0 = readLedger_(cfg); send_(chatId, '<b>Số dư các ví theo sổ</b>\n' + walletLines_(cfg, balances_(led0.rows, cfg)).join('\n') + '\n\nKhai số dư thật: /sodu nh 12.340.000'); break; }
      const p = parseSodu_(args, cfg);
      if (p.errs.length) { send_(chatId, '❌ ' + esc_(p.errs.join('\n❌ ')) + '\nVí dụ: /sodu nh 12.340.000'); break; }
      const led = readLedger_(cfg);
      const calc = balances_(led.rows, cfg)[p.wallet];
      const diff = p.amount - calc;
      if (diff === 0) { send_(chatId, '✅ Ví ' + esc_(p.wallet) + ': sổ ' + fmt_(calc) + ' = thực tế ' + fmt_(p.amount) + '. Khớp hoàn toàn.'); break; }
      const projName = unclearProject_(cfg);
      const cat = findCat_(diff < 0 ? cfg.catsCHI : cfg.catsTHU, 'chenhlechchuagiaithich');
      if (!projName || !cat) { send_(chatId, '❌ Thiếu dự án "Chưa rõ" hoặc danh mục "Chênh lệch chưa giải thích" trong tab CauHinh.'); break; }
      const entry = { type: diff < 0 ? 'CHI' : 'THU', amount: Math.abs(diff), project: projName, channel: '', category: cat, partner: '', note: 'Khai số dư thực ' + fmt_(p.amount) + ', sổ ' + fmt_(calc), dateKey: today, wallet: p.wallet, to: '' };
      const id = appendEntry_(entry, who, 'sodu');
      send_(chatId, (diff < 0 ? '⚠️ ' : 'ℹ️ ') + '<b>Ví ' + esc_(p.wallet) + '</b>: sổ ' + fmt_(calc) + ' · thực tế ' + fmt_(p.amount) + ' · lệch <b>' + fmtS_(diff) + '</b>\n' +
        (diff < 0 ? 'Đây là tiền đã tiêu mà chưa ghi. ' : 'Đây là tiền vào mà chưa ghi. ') + 'Đã ghi dòng #' + id + ' (' + entry.type + ' "chênh lệch chưa giải thích").\nNếu nhập nhầm số thật, gõ /undo.');
      break;
    }
    case 'tien': {
      let key = today;
      if (args) {
        const mm = args.match(/^(\d{1,2})[\/-](\d{4})$/);
        if (!mm || +mm[1] < 1 || +mm[1] > 12) { send_(chatId, '❌ Ví dụ: /tien 10/2026'); break; }
        key = mm[2] + '-' + pad2_(+mm[1]) + '-01';
      }
      send_(chatId, reportMoney_(readLedger_(cfg).rows, cfg, key)); break;
    }
    case 'homnay': case 'baocao': send_(chatId, reportDay_(readLedger_(cfg).rows, cfg, today)); break;
    case 'homqua': send_(chatId, reportDay_(readLedger_(cfg).rows, cfg, addDays_(today, -1))); break;
    case 'ngay': {
      const k = parseDateTok_(args, today);
      if (!k) { send_(chatId, '❌ Ngày không hợp lệ. Ví dụ: /ngay 18/11 hoặc /ngay 18/11/2026'); break; }
      send_(chatId, reportDay_(readLedger_(cfg).rows, cfg, k)); break;
    }
    case 'tuan': send_(chatId, reportWeek_(readLedger_(cfg).rows, cfg, today)); break;
    case 'thang': {
      let key = today;
      if (args) {
        const mm = args.match(/^(\d{1,2})[\/-](\d{4})$/);
        if (!mm || +mm[1] < 1 || +mm[1] > 12) { send_(chatId, '❌ Ví dụ: /thang 10/2026'); break; }
        key = mm[2] + '-' + pad2_(+mm[1]) + '-01';
      }
      send_(chatId, reportMonth_(readLedger_(cfg).rows, cfg, key, today)); break;
    }
    case 'doisoat': { const r = doisoat_(cfg); send_(chatId, '🔎 <b>ĐỐI SOÁT</b>\n' + r.lines.map(esc_).join('\n')); break; }
    case 'ds': {
      const n = Math.min(Math.max(parseInt(args, 10) || 10, 1), 30);
      const sh = sheet_(TAB.SOCAI), last = sh.getLastRow();
      if (last < 2) { send_(chatId, 'Sổ cái đang trống.'); break; }
      const start = Math.max(2, last - n + 1);
      const out = [];
      for (let r = last; r >= start; r--) out.push(esc_(describeRow_(r)));
      send_(chatId, '<b>' + out.length + ' dòng gần nhất</b>\n' + out.join('\n')); break;
    }
    case 'xoa': {
      const id = parseInt(args, 10);
      if (!id) { send_(chatId, '❌ Ví dụ: /xoa 57'); break; }
      const row = findRowById_(id);
      if (!row) { send_(chatId, '❌ Không thấy #' + id); break; }
      const cur = String(sheet_(TAB.SOCAI).getRange(row, COL.TYPE + 1).getValue()).toUpperCase();
      if (cur === 'HUY') { send_(chatId, '#' + id + ' đã hủy trước đó.'); break; }
      voidRow_(row, who);
      send_(chatId, '🗑 Đã hủy (giữ lại dấu vết trong sổ cái): ' + esc_(describeRow_(row))); break;
    }
    case 'undo': {
      const sh = sheet_(TAB.SOCAI), last = sh.getLastRow();
      let found = 0;
      if (last >= 2) {
        const v = sh.getRange(2, 1, last - 1, NCOL).getValues();
        for (let i = v.length - 1; i >= 0; i--) {
          const t = String(v[i][COL.TYPE]).toUpperCase();
          const src = v[i][COL.SOURCE];
          if ((src === 'telegram' || src === 'sodu') && v[i][COL.WHO] === who && (t === 'THU' || t === 'CHI' || t === 'CHUYEN')) { found = i + 2; break; }
        }
      }
      if (!found) { send_(chatId, 'Không có dòng nào của Anh để hủy.'); break; }
      voidRow_(found, who);
      send_(chatId, '↩️ Đã hủy: ' + esc_(describeRow_(found))); break;
    }
    default: send_(chatId, 'Lệnh không có. Gõ /help.');
  }
}

function doPost(e) {
  let chatForError = null;
  try {
    if (!e || !e.postData || (e.parameter && e.parameter.k) !== getSecret_()) return ContentService.createTextOutput('ok');
    const upd = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    let dup = false;
    try {
      const cache = CacheService.getScriptCache();
      const key = 'upd_' + upd.update_id;
      if (cache.get(key)) dup = true; else cache.put(key, '1', 21600);
    } finally { lock.releaseLock(); }
    if (dup) return ContentService.createTextOutput('ok');
    if (upd.message && upd.message.chat) chatForError = String(upd.message.chat.id);
    handleUpdate_(upd);
  } catch (err) {
    console.error(err);
    try { if (chatForError && isAllowed_(chatForError)) send_(chatForError, '❌ Lỗi hệ thống: ' + esc_(err.message)); } catch (e2) { }
  }
  return ContentService.createTextOutput('ok');
}
function doGet() { return ContentService.createTextOutput('MEC Group bot đang chạy.'); }

/* =============================================================
 *  6. BÁO CÁO TỰ ĐỘNG (trigger hằng ngày)
 * ============================================================= */
function baoCaoTuDong() {
  const cfg = loadConfig_();
  const led = readLedger_(cfg);
  const today = todayKey_();
  const extra = negWalletWarnings_(balances_(led.rows, cfg));
  if (led.errors.length) extra.push('⚠️ Sổ cái có ' + led.errors.length + ' dòng lỗi chưa tính đúng. Gõ /doisoat để xem.');
  broadcast_(reportDay_(led.rows, cfg, today, extra));
  if (dow_(today) === 0) { broadcast_(reportWeek_(led.rows, cfg, today)); broadcast_(reportMoney_(led.rows, cfg, today)); }
  if (today.slice(8) === '01') { const prev = addDays_(today, -1); broadcast_(reportMonth_(led.rows, cfg, prev, today)); broadcast_(reportMoney_(led.rows, cfg, prev)); }
}

/* =============================================================
 *  7. CÀI ĐẶT (chạy 1 lần) + MENU
 * ============================================================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('MEC Group')
    .addItem('1. Cài đặt BOT_TOKEN', 'caiDatToken')
    .addItem('2. Cài đặt PIN (mật khẩu đăng ký chat)', 'caiDatPin')
    .addItem('3. Nối bot với Sheet (sau khi Deploy Web app)', 'thietLapWebhook')
    .addSeparator()
    .addItem('Làm mới cấu hình & bảng báo cáo', 'lamMoi')
    .addItem('Gán ví mặc định cho dòng cũ chưa có ví', 'ganViMacDinh')
    .addItem('Gửi báo cáo hôm nay lên Telegram', 'baoCaoTuDong')
    .addItem('Đối soát số liệu', 'menuDoiSoat')
    .addToUi();
}

/** Menu: cài BOT_TOKEN vào Script Properties (không nằm trong code). */
function caiDatToken() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Cài đặt BOT_TOKEN', 'Dán token lấy từ @BotFather. Token được lưu ở Script Properties, không nằm trong code.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(t)) { ui.alert('Token sai định dạng (phải dạng 123456789:AAH...). Chưa lưu.'); return; }
  let info = '';
  try {
    const res = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + t + '/getMe', { muteHttpExceptions: true }).getContentText());
    if (!res.ok) { ui.alert('Telegram từ chối token này (' + (res.description || 'không rõ lý do') + '). Chưa lưu.'); return; }
    info = ' Bot: @' + res.result.username + '.';
  } catch (e) { ui.alert('Không kiểm tra được token với Telegram: ' + e.message + '. Chưa lưu.'); return; }
  props_().setProperty('BOT_TOKEN', t);
  ui.alert('Đã lưu BOT_TOKEN.' + info);
}

/** Menu: cài PIN (mật khẩu để /dangky) vào Script Properties. */
function caiDatPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Cài đặt PIN', 'Đặt mật khẩu (tối thiểu 6 ký tự, không có dấu cách). Dùng để gõ /dangky MẬT_KHẨU trên Telegram.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = r.getResponseText().trim();
  if (v.length < 6 || /\s/.test(v)) { ui.alert('PIN tối thiểu 6 ký tự và không có dấu cách. Chưa lưu.'); return; }
  props_().setProperty('PIN', v);
  ui.alert('Đã lưu PIN.');
}

function menuDoiSoat() {
  const r = doisoat_(loadConfig_());
  SpreadsheetApp.getUi().alert('ĐỐI SOÁT', r.lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function ensureSheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function seedCauHinh_(sh) {
  sh.clear();
  sh.getRange(1, 1, 1, 24).setValues([['Dự án', 'Bí danh dự án (cách nhau dấu phẩy)', 'Nhóm', 'Kênh', 'Bí danh kênh', '', 'Danh mục THU', 'Bí danh', '', 'Danh mục CHI', 'Bí danh', '', 'Thiết lập', 'Giá trị', 'Ý nghĩa', '', 'Đối tác', 'Bí danh đối tác', 'Loại đối tác', '', 'Ví', 'Bí danh ví', 'Loại ví (Thường / Tiết kiệm)', 'Số dư đầu kỳ (đ)']]);
  const put = (col, rows) => { if (rows.length) sh.getRange(2, col, rows.length, rows[0].length).setValues(rows); };
  put(1, SEED.duan); put(4, SEED.kenh); put(7, SEED.thu); put(10, SEED.chi); put(13, SEED.settings); put(17, SEED.partners); put(21, SEED.vi);
  sh.getRange(1, 1, 1, 24).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  sh.getRange(2, 24, 20, 1).setNumberFormat('#,##0').setBackground('#fff2cc');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 24, 130);
  sh.setColumnWidth(2, 220); sh.setColumnWidth(15, 380); sh.setColumnWidth(23, 190);
  sh.getRange('A40').setValue('Lưu ý: (1) không đặt trùng bí danh giữa Dự án, Kênh, Ví và Danh mục; (2) nhập SỐ DƯ ĐẦU KỲ THẬT của từng ví ở cột X (ô vàng) trước khi ghi giao dịch; (3) sửa xong chạy menu MEC Group > Làm mới.');
}

function setList_(range, list) {
  if (!list.length) return;
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
}

function formatSocai_(cfg) {
  const sh = sheet_(TAB.SOCAI);
  const n = 5000;
  if (sh.getMaxRows() < n + 1) sh.insertRowsAfter(sh.getMaxRows(), n + 1 - sh.getMaxRows());
  if (sh.getMaxColumns() < NCOL) sh.insertColumnsAfter(sh.getMaxColumns(), NCOL - sh.getMaxColumns());
  sh.getRange(1, 1, 1, NCOL).setValues([SOCAI_HEADERS]).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange(2, 2, n, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(2, 7, n, 1).setNumberFormat('#,##0');
  sh.getRange(2, 11, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  setList_(sh.getRange(2, 3, n, 1), cfg.projects);
  setList_(sh.getRange(2, 4, n, 1), cfg.channels);
  setList_(sh.getRange(2, 5, n, 1), ['THU', 'CHI', 'CHUYEN', 'HUY']);
  setList_(sh.getRange(2, 6, n, 1), cfg.catsTHU.concat(cfg.catsCHI.filter(c => cfg.catsTHU.indexOf(c) < 0)));
  setList_(sh.getRange(2, 13, n, 1), cfg.wallets);
  setList_(sh.getRange(2, 14, n, 1), cfg.wallets);
  [60, 95, 110, 100, 70, 160, 110, 150, 260, 80, 130, 100, 110, 130].forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function capNhatBaoCao_(cfg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(ss, TAB.BAOCAO);
  sh.clear();
  const cats = cfg.catsCHI, nP = cfg.projects.length;
  const firstCat = 6, lastCol = 5 + cats.length;
  const D = 'SoCai!$B:$B,">="&$B$3,SoCai!$B:$B,"<"&$B$4';
  sh.getRange('A1').setValue('MEC GROUP – BÁO CÁO THÁNG (tính từ tab SoCai; không gồm dòng CHUYEN)').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Chọn tháng (nhập 1 ngày bất kỳ trong tháng):');
  sh.getRange('B2').setFormula('=TODAY()').setNumberFormat('dd/mm/yyyy').setBackground('#fff2cc');
  sh.getRange('A3').setValue('Từ ngày'); sh.getRange('B3').setFormula('=DATE(YEAR(B2),MONTH(B2),1)').setNumberFormat('dd/mm/yyyy');
  sh.getRange('A4').setValue('Đến trước ngày'); sh.getRange('B4').setFormula('=EDATE(B3,1)').setNumberFormat('dd/mm/yyyy');
  sh.getRange(6, 1, 1, lastCol).setValues([['Dự án', 'Thu', 'Chi', 'Chênh lệch', 'Quảng cáo / Thu'].concat(cats)]).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  const qcIdx = cats.map(norm_).indexOf('quangcao');
  const qcCol = qcIdx >= 0 ? colLetter_(firstCat + qcIdx) : null;
  const sumIf = (typeCrit, projCrit, catCrit) => '=SUMIFS(SoCai!$G:$G,' + (projCrit ? 'SoCai!$C:$C,' + projCrit + ',' : '') + 'SoCai!$E:$E,"' + typeCrit + '",' + (catCrit ? 'SoCai!$F:$F,' + catCrit + ',' : '') + D + ')';
  const rows = [];
  for (let i = 0; i < nP; i++) {
    const r = 7 + i, pc = '$A' + r;
    const row = [cfg.projects[i], sumIf('THU', pc), sumIf('CHI', pc), '=B' + r + '-C' + r, qcCol ? '=IF(B' + r + '>0,' + qcCol + r + '/B' + r + ',"")' : ''];
    cats.forEach((c, j) => row.push(sumIf('CHI', pc, colLetter_(firstCat + j) + '$6')));
    rows.push(row);
  }
  const sumRow = 7 + nP, totRow = sumRow + 1, chkRow = totRow + 1;
  const sumF = ['Cộng các dự án'], totF = ['TỔNG TOÀN SỔ (mọi dòng)'];
  for (let c = 2; c <= lastCol; c++) {
    const L = colLetter_(c);
    if (c === 5) { sumF.push(qcCol ? '=IF(B' + sumRow + '>0,' + qcCol + sumRow + '/B' + sumRow + ',"")' : ''); totF.push(qcCol ? '=IF(B' + totRow + '>0,' + qcCol + totRow + '/B' + totRow + ',"")' : ''); }
    else if (c === 4) { sumF.push('=B' + sumRow + '-C' + sumRow); totF.push('=B' + totRow + '-C' + totRow); }
    else {
      sumF.push('=SUM(' + L + '7:' + L + (sumRow - 1) + ')');
      totF.push(c === 2 ? sumIf('THU', null, null) : c === 3 ? sumIf('CHI', null, null) : sumIf('CHI', null, L + '$6'));
    }
  }
  rows.push(sumF); rows.push(totF);
  sh.getRange(7, 1, rows.length, lastCol).setFormulas(rows);
  sh.getRange(chkRow, 1).setValue('Kiểm tra');
  sh.getRange(chkRow, 2).setFormula('=IF(AND(ABS(B' + sumRow + '-B' + totRow + ')<1,ABS(C' + sumRow + '-C' + totRow + ')<1),"✔ Khớp","✖ LỆCH – có dòng sai tên dự án, xem tab SoCai")');
  sh.getRange(7, 2, rows.length, lastCol - 1).setNumberFormat('#,##0');
  sh.getRange(7, 5, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(sumRow, 1, 2, lastCol).setFontWeight('bold').setBackground('#e8eef7');

  // Khối số dư các ví (tính đến hiện tại, không theo tháng)
  const wRow = chkRow + 2, nW = cfg.wallets.length;
  sh.getRange(wRow, 1).setValue('SỐ DƯ CÁC VÍ (tính đến hiện tại, không theo tháng)').setFontWeight('bold');
  sh.getRange(wRow + 1, 1, 1, 7).setValues([['Ví', 'Số dư đầu kỳ', 'Thu', 'Chi', 'Chuyển đi', 'Chuyển đến', 'Số dư hiện tại']]).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  if (nW) {
    sh.getRange(wRow + 2, 1, nW, 2).setValues(cfg.wallets.map(w => [w, cfg.walletInfo[w].opening]));
    const wf = cfg.wallets.map((w, i) => {
      const r = wRow + 2 + i;
      return [
        '=SUMIFS(SoCai!$G:$G,SoCai!$M:$M,$A' + r + ',SoCai!$E:$E,"THU")',
        '=SUMIFS(SoCai!$G:$G,SoCai!$M:$M,$A' + r + ',SoCai!$E:$E,"CHI")',
        '=SUMIFS(SoCai!$G:$G,SoCai!$M:$M,$A' + r + ',SoCai!$E:$E,"CHUYEN")',
        '=SUMIFS(SoCai!$G:$G,SoCai!$N:$N,$A' + r + ',SoCai!$E:$E,"CHUYEN")',
        '=B' + r + '+C' + r + '-D' + r + '-E' + r + '+F' + r
      ];
    });
    sh.getRange(wRow + 2, 3, nW, 5).setFormulas(wf);
    sh.getRange(wRow + 2, 2, nW, 6).setNumberFormat('#,##0');
    sh.getRange(wRow + 2, 7, nW, 1).setFontWeight('bold');
  }
  sh.setColumnWidth(1, 250); sh.setColumnWidths(2, lastCol - 1, 115);
  sh.setFrozenRows(6);
}

function lamMoi() {
  const cfg = loadConfig_();
  formatSocai_(cfg);
  capNhatBaoCao_(cfg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Đã làm mới cấu hình và bảng báo cáo.', 'MEC Group', 5); } catch (e) { }
}

function taoLich_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'baoCaoTuDong') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('baoCaoTuDong').timeBased().everyDays(1).atHour(CONFIG.GIO_BAO_CAO).nearMinute(CONFIG.PHUT_BAO_CAO).inTimezone(CONFIG.TZ).create();
}

/** BƯỚC 1 (cài mới) hoặc nâng cấp từ bản 1: chạy 1 lần. Lần nâng cấp sẽ nạp lại tab CauHinh theo bản 2. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  const ch = ensureSheet_(ss, TAB.CAUHINH);
  if (!ch.getRange('A2').getValue() || props_().getProperty('SCHEMA') !== SCHEMA_VERSION) seedCauHinh_(ch);
  props_().setProperty('SCHEMA', SCHEMA_VERSION);
  ensureSheet_(ss, TAB.SOCAI);
  ensureSheet_(ss, TAB.BAOCAO);
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 3) ss.deleteSheet(def);
  lamMoi();
  taoLich_();
  getSecret_();
  Logger.log('XONG. Việc tiếp theo: (0) menu MEC Group > Cài đặt BOT_TOKEN và Cài đặt PIN; (1) nhập SỐ DƯ ĐẦU KỲ ở tab CauHinh cột X, rồi menu MEC Group > Làm mới; (2) nếu cài mới: Deploy Web app rồi menu MEC Group > Nối bot với Sheet; nếu nâng cấp: Triển khai > Quản lý triển khai > Phiên bản mới.');
}

/** BƯỚC 2 (chỉ khi cài mới): chạy sau khi Deploy Web app. */
function thietLapWebhook() {
  const base = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  if (!base || /\/dev$/.test(base)) throw new Error('Chưa có URL Web app (/exec). Hãy Deploy > New deployment > Web app trước, hoặc dán URL vào CONFIG.WEBAPP_URL.');
  if (!botToken_()) throw new Error('Chưa cài BOT_TOKEN: menu MEC Group > Cài đặt BOT_TOKEN.');
  const url = base + '?k=' + encodeURIComponent(getSecret_());
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/setWebhook', { method: 'post', muteHttpExceptions: true, payload: { url: url, drop_pending_updates: 'true', allowed_updates: JSON.stringify(['message']) } });
  Logger.log(r.getContentText());
  try {
    const ok = JSON.parse(r.getContentText()).ok === true;
    SpreadsheetApp.getUi().alert(ok ? 'Đã nối bot với Sheet. Mở bot trên Telegram và gõ /dangky MẬT_KHẨU.' : 'Telegram báo lỗi: ' + r.getContentText());
  } catch (e) { }
}

function xemTrangThaiWebhook() {
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/getWebhookInfo', { muteHttpExceptions: true }).getContentText());
}

/* =============================================================
 *  8. TỰ KIỂM TRA LOGIC (chạy kiemTra() trong editor, không đụng dữ liệu)
 * ============================================================= */
function kiemTra() {
  const log = [];
  const eq = (a, b, name) => { if (a !== b) throw new Error('FAIL ' + name + ': được ' + a + ', cần ' + b); log.push('ok  ' + name); };
  const nan = (a, name) => { if (!isNaN(a)) throw new Error('FAIL ' + name + ': phải bị từ chối, được ' + a); log.push('ok  ' + name); };
  eq(parseAmount_('350k'), 350000, '350k'); eq(parseAmount_('1.2tr'), 1200000, '1.2tr'); eq(parseAmount_('1,2tr'), 1200000, '1,2tr');
  eq(parseAmount_('1tr2'), 1200000, '1tr2'); eq(parseAmount_('1tr250'), 1250000, '1tr250'); eq(parseAmount_('2k5'), 2500, '2k5');
  eq(parseAmount_('1.500.000'), 1500000, '1.500.000'); eq(parseAmount_('1500000đ'), 1500000, '1500000đ'); eq(parseAmount_('5m'), 5000000, '5m');
  eq(parseAmount_('0.5tr'), 500000, '0.5tr'); eq(parseAmount_('2tỷ'), 2000000000, '2tỷ'); eq(parseAmount_('350.000'), 350000, '350.000');
  nan(parseAmount_('350'), '350 trần bị từ chối'); nan(parseAmount_('abc'), 'abc'); nan(parseAmount_('1.2.3'), '1.2.3'); nan(parseAmount_('0k'), '0k');

  const cfg = cfgFromTables_(SEED);
  const T = '2026-11-19';
  eq(cfg.cashWallet, 'Tiền mặt', 'ví tiền mặt nhận diện'); eq(cfg.defaultWallet, 'Ngân hàng', 'ví mặc định');
  eq(cfg.groupOf['Gia đình'], 'Gia đình', 'nhóm Gia đình'); eq(cfg.groupOf['SuperMall'], 'Kinh doanh', 'nhóm SuperMall');

  let p = parseEntry_('CHI', '350k SuperMall QuangCao Shopee #ghn "đợt 2" 18/11', cfg, T);
  eq(p.errs.length, 0, 'chi hợp lệ không lỗi');
  eq(p.entry.amount, 350000, 'chi amount'); eq(p.entry.project, 'SuperMall', 'chi project'); eq(p.entry.category, 'Quảng cáo', 'chi cat');
  eq(p.entry.channel, 'Shopee', 'chi channel'); eq(p.entry.partner, 'Giao Hàng Nhanh', 'chi partner'); eq(p.entry.note, 'đợt 2', 'chi note'); eq(p.entry.dateKey, '2026-11-18', 'chi date');
  eq(p.entry.wallet, 'Ngân hàng', 'chi ví mặc định');
  p = parseEntry_('THU', '1.2tr dungo web', cfg, T);
  eq(p.errs.length, 0, 'thu hợp lệ'); eq(p.entry.category, 'Doanh thu', 'thu cat mặc định'); eq(p.entry.channel, 'Web', 'thu channel'); eq(p.entry.amount, 1200000, 'thu amount'); eq(p.entry.dateKey, T, 'thu date mặc định');
  p = parseEntry_('THU', '2tr sm sp phi tho hqua', cfg, T);
  eq(p.errs.length, 0, 'thu 2-gram'); eq(p.entry.category, 'Phí thu từ thợ', 'thu cat 2 từ'); eq(p.entry.dateKey, '2026-11-18', 'hqua');
  p = parseEntry_('CHI', '45k CaNhan AnUong', cfg, T, { defaultWallet: 'Tiền mặt' });
  eq(p.errs.length, 0, '/tm hợp lệ'); eq(p.entry.wallet, 'Tiền mặt', '/tm ví tiền mặt'); eq(p.entry.project, 'Cá nhân', '/tm dự án'); eq(p.entry.category, 'Ăn uống', '/tm danh mục');
  p = parseEntry_('CHI', '2tr gd di cho nh', cfg, T);
  eq(p.errs.length, 0, 'chi gia đình'); eq(p.entry.category, 'Đi chợ - Siêu thị', 'đi chợ 2 từ'); eq(p.entry.wallet, 'Ngân hàng', 'ví nh');
  p = parseEntry_('CHI', '1tr ThiQuy nh', cfg, T);
  eq(p.errs.length, 0, 'thi quỹ hợp lệ'); eq(p.entry.category, 'Phí thi quỹ', 'thi quỹ danh mục mặc định');
  p = parseEntry_('CHI', '80k churo tm', cfg, T);
  eq(unclearProject_(cfg), 'Chưa rõ', 'tìm dự án Chưa rõ (dùng cho /sodu)');
  eq(findCat_(cfg.catsCHI, 'chenhlechchuagiaithich'), 'Chênh lệch chưa giải thích', 'danh mục chênh lệch CHI');
  eq(findCat_(cfg.catsTHU, 'chenhlechchuagiaithich'), 'Chênh lệch chưa giải thích', 'danh mục chênh lệch THU');
  eq(p.errs.length, 0, 'chi chưa rõ'); eq(p.entry.category, 'Chi khác', 'chưa rõ danh mục mặc định'); eq(p.entry.wallet, 'Tiền mặt', 'chưa rõ ví tm');
  p = parseEntry_('CHI', '350k quang cao', cfg, T); eq(p.errs.length > 0, true, 'thiếu dự án bị chặn');
  p = parseEntry_('CHI', '350 SuperMall qc', cfg, T); eq(p.errs.length > 0, true, '350 trần bị chặn');
  p = parseEntry_('CHI', '350k SuperMall', cfg, T); eq(p.errs.length > 0, true, 'chi thiếu danh mục bị chặn');
  p = parseEntry_('CHI', '350k 400k SuperMall qc', cfg, T); eq(p.errs.length > 0, true, '2 số tiền bị chặn');
  p = parseEntry_('CHI', '350k SuperMall Dungo qc', cfg, T); eq(p.errs.length > 0, true, '2 dự án bị chặn');
  p = parseEntry_('CHI', '350k SuperMall qc nh tm', cfg, T); eq(p.errs.length > 0, true, '2 ví trong 1 dòng chi bị chặn');
  p = parseEntry_('CHI', '350k SuperMall qc 25/12', cfg, T); eq(p.errs.length > 0, true, 'ngày tương lai bị chặn');
  p = parseEntry_('CHI', '350k SuperMall qc 31/02', cfg, T); eq(p.errs.length > 0, true, 'ngày không tồn tại bị chặn');

  p = parseEntry_('CHUYEN', '500k nh', cfg, T, { rut: true });
  eq(p.errs.length, 0, '/rut hợp lệ'); eq(p.entry.wallet, 'Ngân hàng', '/rut nguồn'); eq(p.entry.to, 'Tiền mặt', '/rut đích'); eq(p.entry.type, 'CHUYEN', '/rut loại');
  p = parseEntry_('CHUYEN', '500k', cfg, T, { rut: true }); eq(p.entry.wallet, 'Ngân hàng', '/rut nguồn mặc định');
  p = parseEntry_('CHUYEN', '5tr nh tk', cfg, T);
  eq(p.errs.length, 0, '/chuyen hợp lệ'); eq(p.entry.wallet, 'Ngân hàng', '/chuyen nguồn'); eq(p.entry.to, 'Tiết kiệm', '/chuyen đích');
  p = parseEntry_('CHUYEN', '5tr nh', cfg, T); eq(p.errs.length > 0, true, '/chuyen thiếu ví đích bị chặn');
  p = parseEntry_('CHUYEN', '5tr nh nh', cfg, T); eq(p.errs.length > 0, true, '/chuyen cùng ví bị chặn');
  p = parseEntry_('CHUYEN', '500k tm', cfg, T, { rut: true }); eq(p.errs.length > 0, true, '/rut từ chính Tiền mặt bị chặn');

  let sd = parseSodu_('nh 12.340.000', cfg); eq(sd.errs.length, 0, 'sodu hợp lệ'); eq(sd.wallet, 'Ngân hàng', 'sodu ví'); eq(sd.amount, 12340000, 'sodu số');
  sd = parseSodu_('tien mat 0', cfg); eq(sd.errs.length, 0, 'sodu ví 2 từ'); eq(sd.wallet, 'Tiền mặt', 'sodu Tiền mặt'); eq(sd.amount, 0, 'sodu bằng 0');
  sd = parseSodu_('nh', cfg); eq(sd.errs.length > 0, true, 'sodu thiếu số bị chặn');

  const R = (d, proj, type, cat, amt, wallet, ch, partner) => ({ row: 2, dateKey: d, project: proj, channel: ch || '', type: type, cat: cat, amount: amt, partner: partner || '', note: '', knownProject: cfg.projects.indexOf(proj) >= 0, wallet: wallet, to: '' });
  const TR = (d, amt, from, to) => ({ row: 2, dateKey: d, project: '', channel: '', type: 'CHUYEN', cat: '', amount: amt, partner: '', note: '', knownProject: true, wallet: from, to: to });
  const rows = [
    R('2026-11-19', 'SuperMall', 'THU', 'Doanh thu', 3100000, 'Ngân hàng', 'Shopee'), R('2026-11-19', 'Dungo', 'THU', 'Doanh thu', 1150000, 'Ngân hàng', 'Web'),
    R('2026-11-19', 'SuperMall', 'CHI', 'Quảng cáo', 650000, 'Ngân hàng', 'Shopee'), R('2026-11-19', 'SuperMall', 'CHI', 'Nhập hàng', 1200000, 'Ngân hàng', '', 'VipoMall'),
    R('2026-11-19', 'Dungo', 'CHI', 'Vận chuyển', 330000, 'Ngân hàng', '', 'Giao Hàng Nhanh'),
    R('2026-11-18', 'SuperMall', 'THU', 'Doanh thu', 2000000, 'Ngân hàng', 'Shopee'), R('2026-11-18', 'SuperMall', 'CHI', 'Quảng cáo', 700000, 'Ngân hàng', 'Shopee'),
    R('2026-11-12', 'Dungo', 'THU', 'Phí thu từ thợ', 500000, 'Ngân hàng', 'Web'), R('2026-11-12', 'Chung', 'CHI', 'Hệ thống', 120000, 'Ngân hàng'),
    R('2026-10-30', 'SuperMall', 'THU', 'Doanh thu', 9000000, 'Ngân hàng', 'Shopee'),
    // cá nhân + ví
    TR('2026-11-15', 2000000, 'Ngân hàng', 'Tiết kiệm'), TR('2026-11-16', 600000, 'Ngân hàng', 'Tiền mặt'),
    R('2026-11-16', 'Cá nhân', 'CHI', 'Ăn uống', 150000, 'Tiền mặt'), R('2026-11-17', 'Chưa rõ', 'CHI', 'Chi khác', 80000, 'Tiền mặt'),
    R('2026-11-17', 'Gia đình', 'CHI', 'Đi chợ - Siêu thị', 900000, 'Ngân hàng'), R('2026-11-17', 'Thi quỹ', 'CHI', 'Phí thi quỹ', 1000000, 'Ngân hàng'),
    R('2026-11-18', 'Chưa rõ', 'CHI', 'Chênh lệch chưa giải thích', 300000, 'Ngân hàng')
  ];
  let s = summarize_(rows, T, T);
  eq(s.thu, 4250000, 'ngày: thu'); eq(s.chi, 2180000, 'ngày: chi'); eq(s.byProject.SuperMall.thu, 3100000, 'ngày: SuperMall thu'); eq(s.byProject.Dungo.chi, 330000, 'ngày: Dungo chi');
  s = summarize_(rows, '2026-11-01', T);
  eq(s.thu, 6750000, 'tháng: thu (không lẫn tháng 10, không tính CHUYEN)'); eq(s.chi, 5430000, 'tháng: chi gồm cá nhân (3.000.000 KD + 150k + 80k + 900k + 1.000k + 300k)');
  const bal = balances_(rows, cfg);
  eq(bal['Ngân hàng'], 9000000 + 3100000 + 1150000 + 2000000 + 500000 - 650000 - 1200000 - 330000 - 700000 - 120000 - 2000000 - 600000 - 900000 - 1000000 - 300000, 'số dư Ngân hàng');
  eq(bal['Tiền mặt'], 600000 - 150000 - 80000, 'số dư Tiền mặt = rút − tiêu');
  eq(bal['Tiết kiệm'], 2000000, 'số dư Tiết kiệm');
  const f = moneyFlow_(rows, cfg, '2026-11-01', '2026-11-30');
  eq(f.savingIn - f.savingOut, 2000000, 'để dành tháng'); eq(f.cashOut, 600000, 'đã rút'); eq(f.cashSpent, 230000, 'đã tiêu tiền mặt (không tính chênh lệch)');
  eq(f.lech, 300000, 'chênh lệch chưa giải thích'); eq(f.chiGroup['Gia đình'], 900000, 'nhóm Gia đình');
  eq(f.chiGroup['Phí thi quỹ'], 1000000, 'nhóm phí thi quỹ'); eq(f.chiGroup['Kinh doanh'], 3000000, 'nhóm Kinh doanh chi');
  const money = reportMoney_(rows, cfg, T);
  eq(money.indexOf('TIỀN ĐI ĐÂU') > 0 && money.indexOf('Để dành') > 0 && money.indexOf('chênh lệch chưa giải thích') > 0, true, '/tien có đủ khối');
  const sg = suggestions_(rows, cfg, T);
  eq(sg.some(x => x.indexOf('SuperMall') >= 0 && x.indexOf('quảng cáo') >= 0), true, 'gợi ý quảng cáo SuperMall');
  eq(sg.some(x => x.indexOf('Gia đình') >= 0 || x.indexOf('Cá nhân') >= 0), false, 'không cảnh báo kinh doanh cho dự án cá nhân');
  const day = reportDay_(rows, cfg, T), wk = reportWeek_(rows, cfg, T), mo = reportMonth_(rows, cfg, T, T);
  eq(day.indexOf('4.250.000') > 0 && day.indexOf('2.180.000') > 0, true, 'báo cáo ngày có số đúng');
  eq(wk.indexOf('TUẦN 16/11/2026') > 0, true, 'tuần bắt đầu thứ Hai 16/11');
  eq(mo.indexOf('6.750.000') > 0, true, 'báo cáo tháng có số đúng');
  eq(negWalletWarnings_({ 'Tiền mặt': -50000, 'Ngân hàng': 10 }).length, 1, 'cảnh báo ví âm');
  eq(weekdayName_(T), 'Thứ năm', '19/11/2026 là Thứ năm');
  eq(fmt_(-1234567), '-1.234.567', 'fmt âm'); eq(fmtS_(2070000), '+2.070.000', 'fmtS');
  log.push('\n--- MẪU /tien ---\n' + money.replace(/<[^>]+>/g, ''));
  Logger.log(log.join('\n'));
  return log.join('\n');
}
