import { supabase } from './supabaseClient.js';
import { uploadImageToStorage } from './storage.js';
import { MiniGamesController } from './games.js';

const DEFAULT_WORD_IMG = 'https://placehold.co/600x400/d1c4b0/4a3f35?text=Tiếng+Hà+Tĩnh';
const DEFAULT_COMMUNITY_IMG = 'https://placehold.co/600x400/d1c4b0/4a3f35?text=Hà+Tĩnh';

const WORDS_PER_PAGE = 9;
const VIDEOS_PER_PAGE = 6;
const COMMUNITY_PER_PAGE = 6;
const ADMIN_PAGE_SIZE = 15;
const MAIN_TABS = ['dictionary', 'videos', 'community', 'games', 'about', 'admin'];
const ADMIN_SUB_TABS = ['pending', 'words', 'videos', 'posts'];

const state = {
    isAdmin: false,
    user: null,
    approvedWords: [],
    pendingWords: [],
    approvedVideos: [],
    pendingVideos: [],
    approvedPosts: [],
    pendingPosts: [],
    currentVideoTab: 'all',
    selectedWordId: null,
    activeTab: 'dictionary',       // 'dictionary' | 'videos' | 'community' | 'games' | 'about' | 'admin'
    activeAdminSubTab: 'pending',  // 'pending' | 'words' | 'videos' | 'posts'
    activeLetter: '',
    wordPage: 1,
    videoPage: 1,
    communityPage: 1,
    adminWordPage: 1,
    adminVideoPage: 1,
    adminPostPage: 1,
    adminWordSearch: '',
    adminVideoSearch: '',
    adminPostSearch: ''
};

const games = new MiniGamesController('gameActiveBox');

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

// --- TOAST & TRẠNG THÁI KẾT NỐI ---
let toastTimer = null;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;

    const icon = toast.querySelector('i');
    if (icon) {
        icon.className = isError
            ? 'fa-solid fa-circle-exclamation text-rose-400 text-base'
            : 'fa-solid fa-circle-check text-amber-400 text-base';
    }

    toastMsg.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 3200);
}

function setCloudStatus(status, text) {
    const dotWrapper = document.getElementById('cloudStatusDot');
    const statusText = document.getElementById('cloudStatusText');
    if (!dotWrapper || !statusText) return;

    const dot = dotWrapper.querySelector('span:first-child');
    statusText.textContent = text;

    if (status === 'connected') {
        dotWrapper.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex-shrink-0';
        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
    } else if (status === 'error') {
        dotWrapper.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex-shrink-0';
        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-rose-600';
    } else {
        dotWrapper.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-vintage-200 text-vintage-700 border border-vintage-300 flex-shrink-0';
        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping';
    }
}

// --- CHUẨN HÓA CHỮ CÁI & PHÂN TRANG DÙNG CHUNG ---
function normalizeFirstChar(word) {
    if (!word) return '';
    const first = String(word).trim().normalize('NFC').charAt(0);
    if (!first) return '';
    if (first === 'đ' || first === 'Đ') return 'Đ';
    return first.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function paginateItems(items, currentPage, pageSize) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (safePage - 1) * pageSize;
    return {
        pageItems: items.slice(start, start + pageSize),
        currentPage: safePage,
        totalPages
    };
}

function renderPagination(containerId, totalItems, currentPage, totalPages, onPageFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalItems === 0) {
        container.innerHTML = '';
        return;
    }

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
    }

    const prevBtn = `
        <button type="button" class="page-btn" onclick="${onPageFnName}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left text-[10px] mr-1"></i>Trang trước
        </button>
    `;

    const pageBtns = pages.map(p => {
        if (p === '...') {
            return `<span class="px-1.5 text-xs text-vintage-600 select-none">...</span>`;
        }
        return `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" onclick="${onPageFnName}(${p})">${p}</button>`;
    }).join('');

    const nextBtn = `
        <button type="button" class="page-btn" onclick="${onPageFnName}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
            Trang sau<i class="fa-solid fa-chevron-right text-[10px] ml-1"></i>
        </button>
    `;

    const info = `<span class="text-xs font-semibold text-vintage-700 ml-1 sm:ml-2">Trang ${currentPage} / ${totalPages}</span>`;
    container.innerHTML = `${prevBtn}<div class="flex items-center gap-1 flex-wrap justify-center">${pageBtns}</div>${nextBtn}${info}`;
}

// --- ĐIỀU HƯỚNG TAB CHÍNH & SUB-TAB ADMIN ---
function applyMainTabVisibility() {
    if (!state.isAdmin && state.activeTab === 'admin') {
        state.activeTab = 'dictionary';
    }

    MAIN_TABS.forEach(tab => {
        const panel = document.getElementById(`panel-${tab}`);
        const navBtn = document.getElementById(`navTab-${tab}`);
        const isCurrent = tab === state.activeTab && (tab !== 'admin' || state.isAdmin);
        if (panel) panel.classList.toggle('hidden', !isCurrent);
        if (navBtn) navBtn.classList.toggle('active', isCurrent);
    });

    const navTabAdmin = document.getElementById('navTab-admin');
    if (navTabAdmin) navTabAdmin.classList.toggle('hidden', !state.isAdmin);

    const heroSection = document.getElementById('heroSection');
    if (heroSection) heroSection.classList.toggle('hidden', state.activeTab !== 'dictionary');

    const totalPending = state.pendingWords.length + state.pendingVideos.length + state.pendingPosts.length;
    const noticeBar = document.getElementById('adminNoticeBar');
    if (noticeBar) {
        const showBanner = state.isAdmin && totalPending > 0 && state.activeTab !== 'admin';
        noticeBar.classList.toggle('hidden', !showBanner);
    }
}

window.switchMainTab = function (tab, subTab = null, shouldScroll = true) {
    if (!MAIN_TABS.includes(tab)) tab = 'dictionary';
    if (tab === 'admin' && !state.isAdmin) tab = 'dictionary';

    state.activeTab = tab;

    if (tab === 'admin' && subTab) {
        switchAdminSubTab(subTab);
    }

    applyMainTabVisibility();

    if (shouldScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.switchAdminSubTab = function (subTab) {
    if (!ADMIN_SUB_TABS.includes(subTab)) subTab = 'pending';
    state.activeAdminSubTab = subTab;

    ADMIN_SUB_TABS.forEach(t => {
        document.getElementById(`adminSubPanel-${t}`)?.classList.toggle('hidden', t !== subTab);
        document.getElementById(`adminSubTab-${t}`)?.classList.toggle('active', t === subTab);
    });
};

window.filterByLetter = function (letter) {
    state.activeLetter = letter || '';
    state.wordPage = 1;
    document.querySelectorAll('#letterFilter .letter-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.letter || '') === state.activeLetter);
    });
    renderWords();
};

window.setWordPage = function (page) {
    state.wordPage = Math.max(1, page);
    renderWords();
    document.getElementById('panel-dictionary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.setVideoPage = function (page) {
    state.videoPage = Math.max(1, page);
    renderVideos();
    document.getElementById('panel-videos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.setCommunityPage = function (page) {
    state.communityPage = Math.max(1, page);
    renderCommunityPosts();
    document.getElementById('panel-community')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.setAdminWordPage = function (page) {
    state.adminWordPage = Math.max(1, page);
    renderAdminWordList();
    document.getElementById('panel-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.setAdminVideoPage = function (page) {
    state.adminVideoPage = Math.max(1, page);
    renderAdminVideoList();
    document.getElementById('panel-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.setAdminPostPage = function (page) {
    state.adminPostPage = Math.max(1, page);
    renderAdminPostList();
    document.getElementById('panel-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// --- AUTH & PHÂN QUYỀN ADMIN ---
function updateAdminUI() {
    const roleLabel = document.getElementById('roleLabel');
    const adminToggleBtn = document.getElementById('adminToggleBtn');
    const adminNotice = document.getElementById('adminImageEditNotice');

    if (state.isAdmin) {
        if (roleLabel) roleLabel.textContent = 'Chế độ: Chủ sở hữu (Admin)';
        if (adminToggleBtn) {
            adminToggleBtn.textContent = 'Thoát Admin';
            adminToggleBtn.className = 'bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg font-bold transition cursor-pointer';
        }
        if (adminNotice) adminNotice.classList.remove('hidden');
    } else {
        if (roleLabel) roleLabel.textContent = 'Chế độ: Khách';
        if (adminToggleBtn) {
            adminToggleBtn.textContent = 'Quản trị (Admin)';
            adminToggleBtn.className = 'bg-terracotta hover:bg-terracotta-dark text-white px-2.5 py-1 rounded-lg font-bold transition cursor-pointer';
        }
        if (adminNotice) adminNotice.classList.add('hidden');
        state.activeTab = 'dictionary';
    }

    applyMainTabVisibility();
    renderWords();
    renderVideos();
    renderCommunityPosts();
    renderAdminPanel();
}

function renderAdminPagedList({
    containerId,
    paginationId,
    items,
    keyword,
    filterFn,
    currentPage,
    setPageStateFn,
    setPageFnName,
    emptyMessage,
    renderRowFn
}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const kw = (keyword || '').trim().toLowerCase();
    const filtered = kw ? items.filter(item => filterFn(item, kw)) : items;
    const { pageItems, currentPage: safePage, totalPages } = paginateItems(filtered, currentPage, ADMIN_PAGE_SIZE);
    setPageStateFn(safePage);

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-vintage-700 py-6 italic bg-vintage-100 rounded-2xl border border-vintage-200">${escapeHtml(emptyMessage)}</p>`;
        renderPagination(paginationId, 0, 1, 1, setPageFnName);
        return;
    }

    container.innerHTML = pageItems.map(renderRowFn).join('');
    renderPagination(paginationId, filtered.length, safePage, totalPages, setPageFnName);
}

function renderAdminWordList() {
    const input = document.getElementById('adminWordSearch');
    if (input) state.adminWordSearch = input.value;
    renderAdminPagedList({
        containerId: 'adminWordListContainer',
        paginationId: 'adminWordPagination',
        items: state.approvedWords,
        keyword: state.adminWordSearch,
        filterFn: (w, kw) =>
            (w.word && w.word.toLowerCase().includes(kw)) ||
            (w.meaning && w.meaning.toLowerCase().includes(kw)),
        currentPage: state.adminWordPage,
        setPageStateFn: p => { state.adminWordPage = p; },
        setPageFnName: 'setAdminWordPage',
        emptyMessage: 'Không tìm thấy từ vựng nào phù hợp.',
        renderRowFn: w => `
            <div class="bg-white border border-vintage-200 p-3 rounded-xl flex justify-between items-center text-xs gap-2">
                <span class="truncate min-w-0"><b>${escapeHtml(w.word)}</b> - ${escapeHtml(w.meaning)}</span>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onclick="quickEditImage(${w.id})" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg cursor-pointer" title="Sửa ảnh"><i class="fa-solid fa-pen text-[10px]"></i> Sửa ảnh</button>
                    <button type="button" onclick="deleteOfficialWord(${w.id})" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-lg cursor-pointer" title="Xóa từ"><i class="fa-solid fa-trash text-[10px]"></i> Xóa từ</button>
                </div>
            </div>
        `
    });
}

function renderAdminVideoList() {
    const input = document.getElementById('adminVideoSearch');
    if (input) state.adminVideoSearch = input.value;
    renderAdminPagedList({
        containerId: 'adminVideoListContainer',
        paginationId: 'adminVideoPagination',
        items: state.approvedVideos,
        keyword: state.adminVideoSearch,
        filterFn: (v, kw) => v.title && v.title.toLowerCase().includes(kw),
        currentPage: state.adminVideoPage,
        setPageStateFn: p => { state.adminVideoPage = p; },
        setPageFnName: 'setAdminVideoPage',
        emptyMessage: 'Không tìm thấy video nào phù hợp.',
        renderRowFn: v => `
            <div class="bg-white border border-vintage-200 p-3 rounded-xl flex justify-between items-center text-xs gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ${v.category === 'folksong' ? 'bg-amber-600 text-white' : 'bg-sage text-white'}">${v.category === 'folksong' ? 'Ví Giặm' : 'Giao tiếp'}</span>
                    <span class="truncate font-semibold text-vintage-900">${escapeHtml(v.title)}</span>
                </div>
                <button type="button" onclick="deleteOfficialVideo(${v.id})" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg flex-shrink-0 cursor-pointer" title="Xóa video"><i class="fa-solid fa-trash text-[10px] mr-1"></i>Xóa</button>
            </div>
        `
    });
}

function renderAdminPostList() {
    const input = document.getElementById('adminPostSearch');
    if (input) state.adminPostSearch = input.value;
    renderAdminPagedList({
        containerId: 'adminCommunityListContainer',
        paginationId: 'adminPostPagination',
        items: state.approvedPosts,
        keyword: state.adminPostSearch,
        filterFn: (p, kw) =>
            (p.title && p.title.toLowerCase().includes(kw)) ||
            (p.author && p.author.toLowerCase().includes(kw)),
        currentPage: state.adminPostPage,
        setPageStateFn: p => { state.adminPostPage = p; },
        setPageFnName: 'setAdminPostPage',
        emptyMessage: 'Không tìm thấy bài viết nào phù hợp.',
        renderRowFn: p => `
            <div class="bg-white border border-vintage-200 p-3 rounded-xl flex justify-between items-center text-xs gap-2">
                <div class="min-w-0">
                    <span class="font-bold text-vintage-900 truncate block">${escapeHtml(p.title)}</span>
                    <span class="text-[11px] text-vintage-600">Tác giả: ${escapeHtml(p.author)}</span>
                </div>
                <button type="button" onclick="deleteOfficialCommunity(${p.id})" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg flex-shrink-0 cursor-pointer" title="Xóa bài viết"><i class="fa-solid fa-trash text-[10px] mr-1"></i>Xóa</button>
            </div>
        `
    });
}

window.filterAdminWordList = function () {
    state.adminWordPage = 1;
    renderAdminWordList();
};

window.filterAdminVideoList = function () {
    state.adminVideoPage = 1;
    renderAdminVideoList();
};

window.filterAdminPostList = function () {
    state.adminPostPage = 1;
    renderAdminPostList();
};

async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    state.user = session?.user || null;
    state.isAdmin = Boolean(state.user);

    supabase.auth.onAuthStateChange((_event, newSession) => {
        state.user = newSession?.user || null;
        state.isAdmin = Boolean(state.user);
        updateAdminUI();
        loadAllData(false);
    });
}

window.toggleAdminMode = async function () {
    if (state.isAdmin) {
        await supabase.auth.signOut();
        state.isAdmin = false;
        switchMainTab('dictionary', null, true);
        showToast('Đã đăng xuất chế độ Quản trị!');
    } else {
        document.getElementById('adminLoginModal')?.classList.remove('hidden');
    }
};

window.closeAdminLoginModal = function () {
    document.getElementById('adminLoginModal')?.classList.add('hidden');
    document.getElementById('adminLoginForm')?.reset();
};

window.submitAdminLogin = async function (event) {
    event.preventDefault();
    const email = document.getElementById('adminEmailInput').value.trim();
    const password = document.getElementById('adminPasswordInput').value;
    const submitBtn = document.getElementById('adminLoginSubmitBtn');

    if (!email || !password) return;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang xác thực...';

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        closeAdminLoginModal();
        showToast('Đăng nhập Admin thành công!');
    } catch (err) {
        showToast(err.message || 'Sai email hoặc mật khẩu quản trị!', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng nhập';
    }
};

// --- TẢI DỮ LIỆU TỪ SUPABASE ---
async function loadAllData(showNotify = false) {
    setCloudStatus('syncing', 'Đang đồng bộ...');
    try {
        const [wordsRes, videosRes, postsRes] = await Promise.all([
            supabase.from('words').select('*').order('created_at', { ascending: false }),
            supabase.from('videos').select('*').order('created_at', { ascending: false }),
            supabase.from('community_posts').select('*').order('created_at', { ascending: false })
        ]);

        if (wordsRes.error) throw wordsRes.error;
        if (videosRes.error) throw videosRes.error;
        if (postsRes.error) throw postsRes.error;

        const allWords = wordsRes.data || [];
        const allVideos = videosRes.data || [];
        const allPosts = postsRes.data || [];

        state.approvedWords = allWords.filter(item => item.status === 'approved');
        state.pendingWords = allWords.filter(item => item.status === 'pending');

        state.approvedVideos = allVideos.filter(item => item.status === 'approved');
        state.pendingVideos = allVideos.filter(item => item.status === 'pending');

        state.approvedPosts = allPosts.filter(item => item.status === 'approved');
        state.pendingPosts = allPosts.filter(item => item.status === 'pending');

        renderWords();
        renderVideos();
        renderCommunityPosts();
        renderAdminPanel();
        games.setWords(state.approvedWords);

        setCloudStatus('connected', 'Đã đồng bộ Supabase');
        if (showNotify) showToast('Đã cập nhật dữ liệu mới nhất từ đám mây!');
    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        setCloudStatus('error', 'Lỗi kết nối');
        showToast('Không thể tải dữ liệu từ Supabase. Kiểm tra kết nối mạng!', true);
    }
}

window.syncFromCloud = function (notify = true) {
    loadAllData(notify);
};

// --- HIỂN THỊ & LỌC TỪ VỰNG ---
function renderWords() {
    const grid = document.getElementById('wordGrid');
    const emptyState = document.getElementById('emptyState');
    const resultCount = document.getElementById('resultCount');
    const keyword = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const letter = state.activeLetter;

    if (!grid) return;

    const filtered = state.approvedWords.filter(w => {
        const matchKeyword = !keyword || (
            (w.word && w.word.toLowerCase().includes(keyword)) ||
            (w.meaning && w.meaning.toLowerCase().includes(keyword)) ||
            (w.context && w.context.toLowerCase().includes(keyword)) ||
            (w.poetry && w.poetry.toLowerCase().includes(keyword))
        );
        const matchLetter = !letter || normalizeFirstChar(w.word) === letter;
        return matchKeyword && matchLetter;
    });

    if (resultCount) resultCount.textContent = `${filtered.length} từ`;

    if (filtered.length === 0) {
        grid.innerHTML = '';
        state.wordPage = 1;
        emptyState?.classList.remove('hidden');
        renderPagination('wordPagination', 0, 1, 1, 'setWordPage');
        return;
    }

    const { pageItems, currentPage, totalPages } = paginateItems(filtered, state.wordPage, WORDS_PER_PAGE);
    state.wordPage = currentPage;

    emptyState?.classList.add('hidden');
    grid.innerHTML = pageItems.map(item => {
        const imgSrc = item.image_url || DEFAULT_WORD_IMG;
        const adminControls = state.isAdmin ? `
            <div class="absolute top-3 right-3 flex items-center gap-1.5" onclick="event.stopPropagation()">
                <button type="button" onclick="quickEditImage(${item.id})" class="bg-amber-500 hover:bg-amber-600 text-white text-xs w-8 h-8 rounded-full flex items-center justify-center shadow-md transition cursor-pointer" title="Sửa ảnh">
                    <i class="fa-solid fa-pen text-[10px]"></i>
                </button>
                <button type="button" onclick="deleteOfficialWord(${item.id})" class="bg-rose-600 hover:bg-rose-700 text-white text-xs w-8 h-8 rounded-full flex items-center justify-center shadow-md transition cursor-pointer" title="Xóa từ này">
                    <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
            </div>
        ` : '';

        return `
            <div onclick="openWordDetail(${item.id})" class="bg-vintage-50 rounded-3xl border border-vintage-300 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col group cursor-pointer relative">
                <div class="relative h-44 overflow-hidden bg-vintage-200">
                    <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.word)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" onerror="this.onerror=null;this.src='${DEFAULT_WORD_IMG}'">
                    <div class="absolute inset-0 bg-gradient-to-t from-vintage-900/60 via-transparent to-transparent"></div>
                    <span class="absolute top-3 left-3 bg-vintage-50/90 backdrop-blur-md text-vintage-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-vintage-300">Phương ngữ</span>
                    ${adminControls}
                    <div class="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                        <h4 class="text-2xl font-extrabold tracking-tight font-serif">${escapeHtml(item.word)}</h4>
                        <span class="w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-xs group-hover:bg-terracotta transition">
                            <i class="fa-solid fa-arrow-right"></i>
                        </span>
                    </div>
                </div>
                <div class="p-5 flex-grow flex flex-col justify-between space-y-3">
                    <div>
                        <p class="text-[10px] font-bold text-vintage-700/60 uppercase tracking-wider mb-1">Nghĩa phổ thông</p>
                        <p class="text-sm font-bold text-vintage-900 font-serif line-clamp-1">${escapeHtml(item.meaning)}</p>
                    </div>
                    <p class="text-xs text-vintage-700 italic bg-vintage-100 p-2.5 rounded-xl border border-vintage-200 line-clamp-2">
                        "${escapeHtml(item.context || 'Đang cập nhật ngữ cảnh...')}"
                    </p>
                </div>
            </div>
        `;
    }).join('');

    renderPagination('wordPagination', filtered.length, currentPage, totalPages, 'setWordPage');
}

window.filterDictionary = function () {
    state.wordPage = 1;
    renderWords();
};

// --- MODAL CHI TIẾT TỪ & PHÁT ÂM ---
window.openWordDetail = function (id) {
    const wordObj = state.approvedWords.find(w => w.id === id);
    if (!wordObj) return;

    state.selectedWordId = id;
    document.getElementById('modalImage').src = wordObj.image_url || DEFAULT_WORD_IMG;
    document.getElementById('modalWord').textContent = wordObj.word;
    document.getElementById('modalMeaning').textContent = wordObj.meaning;
    document.getElementById('modalContext').textContent = wordObj.context ? `"${wordObj.context}"` : 'Chưa có ngữ cảnh minh họa.';
    document.getElementById('modalPoetry').textContent = wordObj.poetry || 'Chưa có câu ca dao, tục ngữ liên quan.';

    const editBtn = document.getElementById('modalEditImgBtn');
    const delBtn = document.getElementById('modalDeleteWordBtn');
    if (state.isAdmin) {
        editBtn?.classList.remove('hidden');
        delBtn?.classList.remove('hidden');
    } else {
        editBtn?.classList.add('hidden');
        delBtn?.classList.add('hidden');
    }

    document.getElementById('detailModal')?.classList.remove('hidden');
};

window.closeModal = function () {
    document.getElementById('detailModal')?.classList.add('hidden');
    state.selectedWordId = null;
};

window.speakNativeWord = function () {
    const wordText = document.getElementById('modalWord')?.textContent;
    if (!wordText || !('speechSynthesis' in window)) {
        showToast('Trình duyệt không hỗ trợ đọc giọng nói.', true);
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(wordText);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
};

// --- VIDEO GIAO TIẾP & VÍ GIẶM ---
function renderVideos() {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;

    const list = state.approvedVideos.filter(v =>
        state.currentVideoTab === 'all' ? true : v.category === state.currentVideoTab
    );

    if (list.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-xs text-vintage-700 py-8 italic">Chưa có video nào trong mục này.</p>`;
        state.videoPage = 1;
        renderPagination('videoPagination', 0, 1, 1, 'setVideoPage');
        return;
    }

    const { pageItems, currentPage, totalPages } = paginateItems(list, state.videoPage, VIDEOS_PER_PAGE);
    state.videoPage = currentPage;

    grid.innerHTML = pageItems.map(vid => {
        const videoId = extractYouTubeId(vid.youtube_url);
        const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : '';
        const isFolk = vid.category === 'folksong';
        const badgeClass = isFolk ? 'bg-amber-600 text-white' : 'bg-sage text-white';
        const badgeText = isFolk ? 'Ví Giặm' : 'Giao tiếp';

        const deleteBtn = state.isAdmin ? `
            <button type="button" onclick="deleteOfficialVideo(${vid.id})" class="bg-rose-600 hover:bg-rose-700 text-white text-xs w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer" title="Xóa video">
                <i class="fa-solid fa-trash text-[10px]"></i>
            </button>
        ` : '';

        return `
            <div class="bg-vintage-100 rounded-3xl overflow-hidden border border-vintage-300 shadow-sm flex flex-col justify-between">
                <div class="relative aspect-video bg-black">
                    ${embedUrl
                ? `<iframe src="${embedUrl}" class="w-full h-full" frameborder="0" allowfullscreen loading="lazy"></iframe>`
                : `<div class="w-full h-full flex items-center justify-center text-white text-xs p-4 text-center">Link YouTube không hợp lệ</div>`
            }
                </div>
                <div class="p-5 space-y-2 flex justify-between items-start gap-2">
                    <div>
                        <span class="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass}">${badgeText}</span>
                        <h4 class="font-serif font-bold text-base text-vintage-900 line-clamp-1 mt-1">${escapeHtml(vid.title)}</h4>
                        <p class="text-xs text-vintage-700 italic line-clamp-2 mt-1">${escapeHtml(vid.description || 'Đang cập nhật mô tả văn hóa...')}</p>
                    </div>
                    ${deleteBtn}
                </div>
            </div>
        `;
    }).join('');

    renderPagination('videoPagination', list.length, currentPage, totalPages, 'setVideoPage');
}

window.switchVideoTab = function (tab) {
    state.currentVideoTab = tab;
    state.videoPage = 1;
    const tabs = {
        all: document.getElementById('tabVidAll'),
        communication: document.getElementById('tabVidComm'),
        folksong: document.getElementById('tabVidSong')
    };

    Object.entries(tabs).forEach(([key, btn]) => {
        if (!btn) return;
        if (key === tab) {
            btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-terracotta text-white shadow cursor-pointer';
        } else {
            btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-vintage-200 text-vintage-800 hover:bg-vintage-300 cursor-pointer';
        }
    });

    renderVideos();
};

// --- CỘNG ĐỒNG & DI SẢN ---
function renderCommunityPosts() {
    const grid = document.getElementById('communityFeedGrid');
    if (!grid) return;

    if (state.approvedPosts.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-xs text-vintage-700 py-8 italic">Chưa có bài viết cộng đồng nào.</p>`;
        state.communityPage = 1;
        renderPagination('communityPagination', 0, 1, 1, 'setCommunityPage');
        return;
    }

    const { pageItems, currentPage, totalPages } = paginateItems(state.approvedPosts, state.communityPage, COMMUNITY_PER_PAGE);
    state.communityPage = currentPage;

    grid.innerHTML = pageItems.map(post => {
        const imgSrc = post.image_url || DEFAULT_COMMUNITY_IMG;
        const deleteBtn = state.isAdmin ? `
            <button type="button" onclick="deleteOfficialCommunity(${post.id})" class="absolute top-3 right-3 bg-rose-600 hover:bg-rose-700 text-white text-xs w-8 h-8 rounded-full flex items-center justify-center shadow-md cursor-pointer" title="Xóa bài viết">
                <i class="fa-solid fa-trash text-[10px]"></i>
            </button>
        ` : '';

        return `
            <div class="bg-vintage-100 rounded-3xl overflow-hidden border border-vintage-300 shadow-sm flex flex-col justify-between relative">
                <div class="relative h-48 bg-vintage-200">
                    <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${DEFAULT_COMMUNITY_IMG}'">
                    ${deleteBtn}
                </div>
                <div class="p-5 space-y-2 flex-grow">
                    <span class="text-[11px] font-semibold text-terracotta"><i class="fa-solid fa-user-pen mr-1"></i> ${escapeHtml(post.author)}</span>
                    <h4 class="font-serif font-bold text-base text-vintage-900 line-clamp-1">${escapeHtml(post.title)}</h4>
                    <p class="text-xs text-vintage-700 line-clamp-3">${escapeHtml(post.content)}</p>
                </div>
            </div>
        `;
    }).join('');

    renderPagination('communityPagination', state.approvedPosts.length, currentPage, totalPages, 'setCommunityPage');
}

// --- ĐÓNG GÓP NỘI DUNG MỚI (GỬI CHỜ DUYỆT) ---
window.openAddModal = () => document.getElementById('contributeModal')?.classList.remove('hidden');
window.closeAddModal = () => {
    document.getElementById('contributeModal')?.classList.add('hidden');
    document.getElementById('singleWordForm')?.reset();
};

window.submitNewWord = async function (event) {
    event.preventDefault();
    const word = document.getElementById('contribWord').value.trim();
    const meaning = document.getElementById('contribMeaning').value.trim();
    const context = document.getElementById('contribContext').value.trim();
    const poetry = document.getElementById('contribPoetry').value.trim();
    const imageUrlInput = document.getElementById('contribImage').value.trim();
    const imageFile = document.getElementById('contribImageFile').files[0];

    if (!word || !meaning) return;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';

        let finalImageUrl = imageUrlInput || null;
        if (imageFile) {
            finalImageUrl = await uploadImageToStorage(imageFile, 'words');
        }

        const { error } = await supabase.from('words').insert([{
            word,
            meaning,
            context: context || null,
            poetry: poetry || null,
            image_url: finalImageUrl,
            status: 'pending'
        }]);

        if (error) throw error;

        closeAddModal();
        showToast('Đã gửi đóng góp! Từ vựng đang chờ Admin phê duyệt.');
        if (state.isAdmin) await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Gửi đóng góp thất bại!', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi đóng góp';
    }
};

window.openBatchModal = () => document.getElementById('batchModal')?.classList.remove('hidden');
window.closeBatchModal = () => {
    document.getElementById('batchModal')?.classList.add('hidden');
    const fileInput = document.getElementById('batchFileinput');
    if (fileInput) fileInput.value = '';
};

window.processBatchUpload = async function () {
    const fileInput = document.getElementById('batchFileinput');
    const file = fileInput?.files?.[0];
    if (!file) {
        showToast('Vui lòng chọn tệp JSON trước!', true);
        return;
    }

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : (parsed.officialWords || parsed.words || []);

        if (!Array.isArray(list) || list.length === 0) {
            throw new Error('Tệp JSON không chứa danh sách từ hợp lệ.');
        }

        const rows = list
            .filter(item => item.word && item.meaning)
            .map(item => ({
                word: String(item.word).trim(),
                meaning: String(item.meaning).trim(),
                context: item.context ? String(item.context).trim() : null,
                poetry: item.poetry ? String(item.poetry).trim() : null,
                image_url: (item.image || item.image_url || '').startsWith('http') ? (item.image || item.image_url) : null,
                status: 'pending'
            }));

        if (rows.length === 0) {
            throw new Error('Không tìm thấy từ nào đủ trường "word" và "meaning".');
        }

        const { error } = await supabase.from('words').insert(rows);
        if (error) throw error;

        closeBatchModal();
        showToast(`Đã gửi ${rows.length} từ vựng vào hàng chờ phê duyệt!`);
        if (state.isAdmin) await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi đọc tệp JSON!', true);
    }
};

window.openVideoModal = () => document.getElementById('videoModal')?.classList.remove('hidden');
window.closeVideoModal = () => {
    document.getElementById('videoModal')?.classList.add('hidden');
    document.getElementById('videoForm')?.reset();
};

window.submitNewVideo = async function (event) {
    event.preventDefault();
    const title = document.getElementById('vidTitle').value.trim();
    const category = document.getElementById('vidCategory').value;
    const youtube_url = document.getElementById('vidUrl').value.trim();
    const description = document.getElementById('vidDesc').value.trim();

    if (!extractYouTubeId(youtube_url)) {
        showToast('Đường dẫn YouTube không hợp lệ!', true);
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';

        const { error } = await supabase.from('videos').insert([{
            title,
            category,
            youtube_url,
            description: description || null,
            status: 'pending'
        }]);

        if (error) throw error;

        closeVideoModal();
        showToast('Đã gửi video tư liệu! Đang chờ Admin phê duyệt.');
        if (state.isAdmin) await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi gửi video!', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi video lên';
    }
};

window.openCommunityModal = () => document.getElementById('communityModal')?.classList.remove('hidden');
window.closeCommunityModal = () => {
    document.getElementById('communityModal')?.classList.add('hidden');
    document.getElementById('communityForm')?.reset();
};

window.submitNewCommunityPost = async function (event) {
    event.preventDefault();
    const title = document.getElementById('commTitle').value.trim();
    const author = document.getElementById('commAuthor').value.trim();
    const content = document.getElementById('commContent').value.trim();
    const imageUrlInput = document.getElementById('commImage').value.trim();
    const imageFile = document.getElementById('commImageFile').files[0];

    const submitBtn = event.target.querySelector('button[type="submit"]');
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';

        let finalImageUrl = imageUrlInput || null;
        if (imageFile) {
            finalImageUrl = await uploadImageToStorage(imageFile, 'community');
        }

        const { error } = await supabase.from('community_posts').insert([{
            title,
            author,
            content,
            image_url: finalImageUrl,
            status: 'pending'
        }]);

        if (error) throw error;

        closeCommunityModal();
        showToast('Đã gửi bài viết văn hóa! Đang chờ Admin phê duyệt.');
        if (state.isAdmin) await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi gửi bài viết!', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi bài đăng';
    }
};

// --- BẢNG QUẢN TRỊ & KIỂM DUYỆT (CHỈ ADMIN) ---
function renderAdminPanel() {
    const adminNavLabel = document.getElementById('adminNavLabel');
    const noticeBar = document.getElementById('adminNoticeBar');

    if (!state.isAdmin) {
        noticeBar?.classList.add('hidden');
        if (adminNavLabel) adminNavLabel.textContent = 'Quản trị';
        return;
    }

    const totalPending = state.pendingWords.length + state.pendingVideos.length + state.pendingPosts.length;
    const pendingBadge = document.getElementById('pendingCountBadge');
    const pendingContainer = document.getElementById('pendingListContainer');
    const noPendingMsg = document.getElementById('noPendingMsg');

    // Cập nhật badge số chờ duyệt trên tab Quản trị
    if (adminNavLabel) {
        adminNavLabel.innerHTML = totalPending > 0
            ? `Quản trị <span class="admin-tab-badge">${totalPending}</span>`
            : 'Quản trị';
    }

    // Cập nhật số lượng trên 4 sub-tab
    const subPendingBtn = document.getElementById('adminSubTab-pending');
    const subWordsBtn = document.getElementById('adminSubTab-words');
    const subVideosBtn = document.getElementById('adminSubTab-videos');
    const subPostsBtn = document.getElementById('adminSubTab-posts');

    if (subPendingBtn) {
        subPendingBtn.innerHTML = totalPending > 0
            ? `<i class="fa-solid fa-clock-rotate-left"></i> Chờ duyệt <span class="admin-tab-badge">${totalPending}</span>`
            : `<i class="fa-solid fa-clock-rotate-left"></i> Chờ duyệt (0)`;
    }
    if (subWordsBtn) subWordsBtn.innerHTML = `<i class="fa-solid fa-book"></i> Từ vựng (${state.approvedWords.length})`;
    if (subVideosBtn) subVideosBtn.innerHTML = `<i class="fa-solid fa-video"></i> Video (${state.approvedVideos.length})`;
    if (subPostsBtn) subPostsBtn.innerHTML = `<i class="fa-solid fa-id-card"></i> Bài viết (${state.approvedPosts.length})`;

    if (pendingBadge) pendingBadge.textContent = `${totalPending} chờ duyệt`;

    if (totalPending > 0) {
        noticeBar?.classList.toggle('hidden', state.activeTab === 'admin');
        noPendingMsg?.classList.add('hidden');
    } else {
        noticeBar?.classList.add('hidden');
        noPendingMsg?.classList.remove('hidden');
    }

    if (pendingContainer) {
        const pendingHtml = [
            ...state.pendingWords.map(w => `
                <div class="bg-white border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                    <div class="space-y-1">
                        <span class="inline-block bg-terracotta text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Từ vựng mới</span>
                        <p class="font-bold text-sm text-vintage-900">${escapeHtml(w.word)} — <span class="font-normal">${escapeHtml(w.meaning)}</span></p>
                        ${w.context ? `<p class="text-vintage-700 italic">"${escapeHtml(w.context)}"</p>` : ''}
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                        <button type="button" onclick="approveItem('words', ${w.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-check mr-1"></i> Duyệt
                        </button>
                        <button type="button" onclick="rejectItem('words', ${w.id})" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-xmark mr-1"></i> Từ chối
                        </button>
                    </div>
                </div>
            `),
            ...state.pendingVideos.map(v => `
                <div class="bg-white border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                    <div class="space-y-1">
                        <span class="inline-block bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Video mới</span>
                        <p class="font-bold text-sm text-vintage-900">${escapeHtml(v.title)}</p>
                        <p class="text-vintage-700 truncate max-w-md">${escapeHtml(v.youtube_url)}</p>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                        <button type="button" onclick="approveItem('videos', ${v.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-check mr-1"></i> Duyệt
                        </button>
                        <button type="button" onclick="rejectItem('videos', ${v.id})" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-xmark mr-1"></i> Từ chối
                        </button>
                    </div>
                </div>
            `),
            ...state.pendingPosts.map(p => `
                <div class="bg-white border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                    <div class="space-y-1">
                        <span class="inline-block bg-sage text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Bài viết mới</span>
                        <p class="font-bold text-sm text-vintage-900">${escapeHtml(p.title)} <span class="font-normal text-vintage-600">(${escapeHtml(p.author)})</span></p>
                        <p class="text-vintage-700 line-clamp-2">${escapeHtml(p.content)}</p>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                        <button type="button" onclick="approveItem('community_posts', ${p.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-check mr-1"></i> Duyệt
                        </button>
                        <button type="button" onclick="rejectItem('community_posts', ${p.id})" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                            <i class="fa-solid fa-xmark mr-1"></i> Từ chối
                        </button>
                    </div>
                </div>
            `)
        ];
        pendingContainer.innerHTML = pendingHtml.join('');
    }

    // Danh sách quản lý nội dung đã duyệt (có tìm kiếm + phân trang 15 dòng/trang)
    renderAdminWordList();
    renderAdminVideoList();
    renderAdminPostList();
}

window.scrollToAdminPanel = function () {
    if (state.isAdmin) {
        switchMainTab('admin', 'pending');
    }
};

window.approveItem = async function (table, id) {
    if (!state.isAdmin) return;
    try {
        const { error } = await supabase.from(table).update({ status: 'approved' }).eq('id', id);
        if (error) throw error;
        showToast('Đã phê duyệt và đăng công khai!');
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi khi duyệt nội dung!', true);
    }
};

window.rejectItem = async function (table, id) {
    if (!state.isAdmin) return;
    if (!confirm('Bạn có chắc muốn từ chối đóng góp này?')) return;
    try {
        const { error } = await supabase.from(table).update({ status: 'rejected' }).eq('id', id);
        if (error) throw error;
        showToast('Đã từ chối đóng góp!');
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi khi từ chối!', true);
    }
};

window.quickEditImage = async function (id) {
    if (!state.isAdmin) return;
    const wordObj = state.approvedWords.find(w => w.id === id);
    if (!wordObj) return;

    const newUrl = prompt(`Nhập URL ảnh mới cho từ "${wordObj.word}":`, wordObj.image_url || '');
    if (newUrl === null) return;

    try {
        const { error } = await supabase
            .from('words')
            .update({ image_url: newUrl.trim() || null })
            .eq('id', id);
        if (error) throw error;
        showToast(`Đã cập nhật ảnh cho từ "${wordObj.word}"!`);
        await loadAllData(false);
        if (state.selectedWordId === id) openWordDetail(id);
    } catch (err) {
        showToast(err.message || 'Không thể cập nhật ảnh!', true);
    }
};

window.deleteOfficialWord = async function (id) {
    if (!state.isAdmin) return;
    if (!confirm('Bạn có chắc chắn muốn xóa từ vựng này khỏi từ điển?')) return;
    try {
        const { error } = await supabase.from('words').delete().eq('id', id);
        if (error) throw error;
        if (state.selectedWordId === id) closeModal();
        showToast('Đã xóa từ vựng!');
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi khi xóa từ!', true);
    }
};

window.deleteOfficialVideo = async function (id) {
    if (!state.isAdmin) return;
    if (!confirm('Xóa video tư liệu này?')) return;
    try {
        const { error } = await supabase.from('videos').delete().eq('id', id);
        if (error) throw error;
        showToast('Đã xóa video!');
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi khi xóa video!', true);
    }
};

window.deleteOfficialCommunity = async function (id) {
    if (!state.isAdmin) return;
    if (!confirm('Xóa bài viết văn hóa này?')) return;
    try {
        const { error } = await supabase.from('community_posts').delete().eq('id', id);
        if (error) throw error;
        showToast('Đã xóa bài viết!');
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi khi xóa bài viết!', true);
    }
};

window.promptEditImageFromModal = function () {
    if (state.selectedWordId) quickEditImage(state.selectedWordId);
};

window.promptDeleteWordFromModal = function () {
    if (state.selectedWordId) deleteOfficialWord(state.selectedWordId);
};

// --- XUẤT / NHẬP JSON BACKUP ---
window.exportDataJSON = function () {
    const payload = {
        exportedAt: new Date().toISOString(),
        officialWords: state.approvedWords,
        officialVideos: state.approvedVideos,
        officialCommunityPosts: state.approvedPosts
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tu-dien-ha-tinh-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất tệp sao lưu JSON!');
};

window.importDataJSON = async function (event) {
    const file = event.target.files?.[0];
    if (!file || !state.isAdmin) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const words = data.officialWords || data.words || [];
        if (!Array.isArray(words) || words.length === 0) {
            throw new Error('Không tìm thấy dữ liệu từ vựng trong tệp JSON.');
        }

        const rows = words
            .filter(w => w.word && w.meaning)
            .map(w => ({
                word: String(w.word).trim(),
                meaning: String(w.meaning).trim(),
                context: w.context || null,
                poetry: w.poetry || null,
                image_url: (w.image_url || w.image || '').startsWith('http') ? (w.image_url || w.image) : null,
                status: 'approved'
            }));

        const { error } = await supabase.from('words').insert(rows);
        if (error) throw error;

        showToast(`Đã nhập thành công ${rows.length} từ vựng!`);
        await loadAllData(false);
    } catch (err) {
        showToast(err.message || 'Lỗi nhập JSON!', true);
    } finally {
        event.target.value = '';
    }
};

// --- BINDING SỰ KIỆN MINI-GAMES ---
window.switchGameMode = (mode) => games.switchMode(mode);
window.checkMCQAnswer = (sel, cor) => games.checkMCQ(sel, cor);
window.nextMCQ = () => { games.mcqState.index += 1; games.renderMCQ(); };
window.restartMCQ = () => { games.resetAll(); games.renderMCQ(); };

window.checkFillBlank = () => games.checkFillBlank();
window.nextFillBlank = () => { games.fillState.index += 1; games.renderFillBlank(); };
window.restartFillBlank = () => { games.resetAll(); games.renderFillBlank(); };

window.checkUnscramble = () => games.checkUnscramble();
window.nextUnscramble = () => { games.unscrambleState.index += 1; games.renderUnscramble(); };
window.restartUnscramble = () => { games.resetAll(); games.renderUnscramble(); };

// --- KHỞI CHẠY ỨNG DỤNG ---
document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    updateAdminUI();
    switchMainTab('dictionary', null, false);
    switchAdminSubTab('pending');
    await loadAllData(false);
});