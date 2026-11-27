function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function normalizeText(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export class MiniGamesController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.words = [];
        this.mode = 'multipleChoice';
        this.totalQuestions = 5;

        this.mcqState = { index: 0, score: 0, pool: [] };
        this.fillState = { index: 0, score: 0, pool: [] };
        this.unscrambleState = { index: 0, score: 0, pool: [] };
    }

    setWords(approvedWords) {
        this.words = Array.isArray(approvedWords) ? approvedWords : [];
        this.resetAll();
        this.render();
    }

    resetAll() {
        const shuffled = shuffleArray(this.words);
        const count = Math.min(this.totalQuestions, shuffled.length);
        this.mcqState = { index: 0, score: 0, pool: shuffled.slice(0, count) };
        this.fillState = { index: 0, score: 0, pool: shuffleArray(this.words).slice(0, count) };
        this.unscrambleState = { index: 0, score: 0, pool: shuffleArray(this.words).slice(0, count) };
    }

    switchMode(mode) {
        this.mode = mode;
        const tabs = {
            multipleChoice: document.getElementById('tabMultipleChoice'),
            fillBlank: document.getElementById('tabFillBlank'),
            unscramble: document.getElementById('tabUnscramble')
        };

        Object.entries(tabs).forEach(([key, btn]) => {
            if (!btn) return;
            if (key === mode) {
                btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-terracotta text-white shadow cursor-pointer';
            } else {
                btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-vintage-700 text-vintage-200 hover:bg-vintage-600 cursor-pointer';
            }
        });

        this.render();
    }

    render() {
        if (!this.container) return;

        if (this.words.length < 4) {
            this.container.innerHTML = `
                <div class="text-center py-6 text-xs text-vintage-700">
                    Cần ít nhất 4 từ vựng chính thức trong từ điển để bắt đầu trò chơi.
                </div>
            `;
            return;
        }

        if (this.mode === 'multipleChoice') this.renderMCQ();
        else if (this.mode === 'fillBlank') this.renderFillBlank();
        else if (this.mode === 'unscramble') this.renderUnscramble();
    }

    renderSummary(title, score, total, onRestartFnName) {
        this.container.innerHTML = `
            <div class="text-center py-4 space-y-4">
                <div class="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                    <i class="fa-solid fa-trophy"></i>
                </div>
                <div>
                    <h4 class="text-lg font-serif font-bold text-vintage-900">Hoàn thành: ${escapeHtml(title)}</h4>
                    <p class="text-xs text-vintage-700 mt-1">Bạn đạt được <b class="text-terracotta text-sm">${score}/${total}</b> điểm!</p>
                </div>
                <button type="button" onclick="${onRestartFnName}()" class="bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold px-5 py-2.5 rounded-xl transition cursor-pointer">
                    <i class="fa-solid fa-rotate-right mr-1"></i> Chơi lại lượt mới
                </button>
            </div>
        `;
    }

    // 1. TRẮC NGHIỆM NGHĨA TỪ
    renderMCQ() {
        const { index, score, pool } = this.mcqState;
        if (index >= pool.length) {
            this.renderSummary('Trắc nghiệm nghĩa từ', score, pool.length, 'restartMCQ');
            return;
        }

        const current = pool[index];
        const distractors = shuffleArray(this.words.filter(w => w.id !== current.id))
            .slice(0, 3)
            .map(w => w.meaning);
        const options = shuffleArray([current.meaning, ...distractors]);
        const correctIdx = options.indexOf(current.meaning);

        this.container.innerHTML = `
            <div class="flex justify-between items-center text-xs font-bold text-vintage-600 mb-3">
                <span>Trắc nghiệm nghĩa từ • Câu ${index + 1}/${pool.length}</span>
                <span class="bg-sage text-white px-3 py-1 rounded-lg">Điểm: ${score}</span>
            </div>
            <h4 class="text-base font-serif font-bold text-vintage-900 mb-4">
                Từ '${escapeHtml(current.word)}' trong phương ngữ Hà Tĩnh có nghĩa là gì?
            </h4>
            <div id="mcqOptions" class="space-y-2.5">
                ${options.map((opt, idx) => `
                    <button type="button" onclick="checkMCQAnswer(${idx}, ${correctIdx})"
                        class="w-full text-left bg-vintage-100 hover:bg-vintage-200 border border-vintage-300 p-3 rounded-xl text-xs font-semibold text-vintage-900 flex justify-between items-center transition cursor-pointer">
                        <span>${escapeHtml(opt)}</span>
                        <i class="fa-regular fa-circle text-vintage-400"></i>
                    </button>
                `).join('')}
            </div>
            <div id="gameFeedback" class="hidden mt-4 p-3 rounded-xl text-xs font-semibold"></div>
            <button type="button" id="gameNextBtn" onclick="nextMCQ()" class="hidden mt-4 w-full bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold py-3 rounded-xl transition shadow cursor-pointer">
                Câu tiếp theo <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
        `;
    }

    checkMCQ(selectedIdx, correctIdx) {
        const optionBtns = this.container.querySelectorAll('#mcqOptions button');
        optionBtns.forEach((btn, idx) => {
            btn.disabled = true;
            btn.classList.remove('hover:bg-vintage-200', 'cursor-pointer');
            if (idx === correctIdx) {
                btn.classList.remove('bg-vintage-100', 'border-vintage-300');
                btn.classList.add('bg-emerald-100', 'border-emerald-300', 'text-emerald-800');
                btn.querySelector('i').className = 'fa-solid fa-circle-check text-emerald-600';
            } else if (idx === selectedIdx) {
                btn.classList.remove('bg-vintage-100', 'border-vintage-300');
                btn.classList.add('bg-rose-100', 'border-rose-300', 'text-rose-800');
                btn.querySelector('i').className = 'fa-solid fa-circle-xmark text-rose-600';
            }
        });

        const feedback = document.getElementById('gameFeedback');
        const nextBtn = document.getElementById('gameNextBtn');
        feedback.classList.remove('hidden');
        nextBtn.classList.remove('hidden');

        if (selectedIdx === correctIdx) {
            this.mcqState.score += 1;
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
            feedback.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Chính xác! Giỏi lắm!';
        } else {
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300';
            feedback.innerHTML = '<i class="fa-solid fa-circle-info mr-1"></i> Chưa đúng rồi, xem đáp án tô xanh phía trên nhé!';
        }
    }

    // 2. ĐIỀN PHƯƠNG NGỮ
    renderFillBlank() {
        const { index, score, pool } = this.fillState;
        if (index >= pool.length) {
            this.renderSummary('Điền phương ngữ', score, pool.length, 'restartFillBlank');
            return;
        }

        const current = pool[index];
        let maskedContext = '';
        if (current.context) {
            const escapedWord = current.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedWord, 'gi');
            maskedContext = current.context.replace(regex, '_______');
        }

        this.container.innerHTML = `
            <div class="flex justify-between items-center text-xs font-bold text-vintage-600 mb-3">
                <span>Điền phương ngữ • Câu ${index + 1}/${pool.length}</span>
                <span class="bg-sage text-white px-3 py-1 rounded-lg">Điểm: ${score}</span>
            </div>
            <p class="text-xs text-vintage-700 mb-1">Gợi ý nghĩa phổ thông:</p>
            <h4 class="text-base font-serif font-bold text-vintage-900 mb-3">${escapeHtml(current.meaning)}</h4>
            ${maskedContext ? `<p class="text-xs italic bg-vintage-100 p-3 rounded-xl border border-vintage-200 mb-4">"${escapeHtml(maskedContext)}"</p>` : ''}
            <div class="flex gap-2">
                <input type="text" id="fillBlankInput" placeholder="Nhập từ tiếng Hà Tĩnh tương ứng..."
                    onkeydown="if(event.key==='Enter') checkFillBlank()"
                    class="flex-grow bg-white border border-vintage-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-terracotta focus:outline-none">
                <button type="button" id="fillCheckBtn" onclick="checkFillBlank()"
                    class="bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer">
                    Kiểm tra
                </button>
            </div>
            <div id="gameFeedback" class="hidden mt-4 p-3 rounded-xl text-xs font-semibold"></div>
            <button type="button" id="gameNextBtn" onclick="nextFillBlank()" class="hidden mt-4 w-full bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold py-3 rounded-xl transition shadow cursor-pointer">
                Câu tiếp theo <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
        `;
    }

    checkFillBlank() {
        const input = document.getElementById('fillBlankInput');
        const btn = document.getElementById('fillCheckBtn');
        if (!input || btn.disabled) return;

        const current = this.fillState.pool[this.fillState.index];
        const userAns = normalizeText(input.value);
        const correctAns = normalizeText(current.word);

        if (!userAns) return;

        input.disabled = true;
        btn.disabled = true;

        const feedback = document.getElementById('gameFeedback');
        const nextBtn = document.getElementById('gameNextBtn');
        feedback.classList.remove('hidden');
        nextBtn.classList.remove('hidden');

        if (userAns === correctAns) {
            this.fillState.score += 1;
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
            feedback.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Chuẩn xác! Đáp án là <b>${escapeHtml(current.word)}</b>.`;
        } else {
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300';
            feedback.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> Chưa chính xác. Đáp án đúng là: <b>${escapeHtml(current.word)}</b>.`;
        }
    }

    // 3. GIẢI MÃ CHỮ CÁI
    renderUnscramble() {
        const { index, score, pool } = this.unscrambleState;
        if (index >= pool.length) {
            this.renderSummary('Giải mã chữ cái', score, pool.length, 'restartUnscramble');
            return;
        }

        const current = pool[index];
        const chars = current.word.replace(/\s+/g, '').split('');
        let scrambled = shuffleArray(chars);
        if (scrambled.join('') === chars.join('') && chars.length > 1) {
            scrambled.reverse();
        }

        this.container.innerHTML = `
            <div class="flex justify-between items-center text-xs font-bold text-vintage-600 mb-3">
                <span>Giải mã chữ cái • Câu ${index + 1}/${pool.length}</span>
                <span class="bg-sage text-white px-3 py-1 rounded-lg">Điểm: ${score}</span>
            </div>
            <p class="text-xs text-vintage-700 mb-2">Sắp xếp các chữ cái sau thành từ phương ngữ có nghĩa: <b>${escapeHtml(current.meaning)}</b></p>
            <div class="flex flex-wrap gap-2 my-4">
                ${scrambled.map(ch => `
                    <span class="px-3 py-2 bg-amber-100 border border-amber-300 text-amber-900 font-serif font-bold text-sm rounded-xl uppercase shadow-sm">
                        ${escapeHtml(ch)}
                    </span>
                `).join('')}
            </div>
            <div class="flex gap-2">
                <input type="text" id="unscrambleInput" placeholder="Gõ lại từ hoàn chỉnh (có dấu)..."
                    onkeydown="if(event.key==='Enter') checkUnscramble()"
                    class="flex-grow bg-white border border-vintage-300 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-terracotta focus:outline-none">
                <button type="button" id="unscrambleCheckBtn" onclick="checkUnscramble()"
                    class="bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer">
                    Giải mã
                </button>
            </div>
            <div id="gameFeedback" class="hidden mt-4 p-3 rounded-xl text-xs font-semibold"></div>
            <button type="button" id="gameNextBtn" onclick="nextUnscramble()" class="hidden mt-4 w-full bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold py-3 rounded-xl transition shadow cursor-pointer">
                Câu tiếp theo <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
        `;
    }

    checkUnscramble() {
        const input = document.getElementById('unscrambleInput');
        const btn = document.getElementById('unscrambleCheckBtn');
        if (!input || btn.disabled) return;

        const current = this.unscrambleState.pool[this.unscrambleState.index];
        const userAns = normalizeText(input.value);
        const correctAns = normalizeText(current.word);

        if (!userAns) return;

        input.disabled = true;
        btn.disabled = true;

        const feedback = document.getElementById('gameFeedback');
        const nextBtn = document.getElementById('gameNextBtn');
        feedback.classList.remove('hidden');
        nextBtn.classList.remove('hidden');

        if (userAns === correctAns) {
            this.unscrambleState.score += 1;
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
            feedback.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Tuyệt vời! Từ cần tìm là <b>${escapeHtml(current.word)}</b>.`;
        } else {
            feedback.className = 'mt-4 p-3 rounded-xl text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300';
            feedback.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> Chưa đúng rồi! Đáp án chính xác là: <b>${escapeHtml(current.word)}</b>.`;
        }
    }
}