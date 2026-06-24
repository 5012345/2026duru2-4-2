// ============================================================================
// 1. FIREBASE & MULTIPLAYER CONTEXT & CONFIG
// ============================================================================
let firebaseApp = null;
let db = null;
let isFirebaseMode = false;

// 로컬 브라우저 탭 간 실시간 동기화를 위한 BroadcastChannel (Firebase 없을 시 무설정 연동)
const localChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('neon_bingo_local_channel') : null;

// 게임 상태 변수
let localPlayerId = "player_" + Math.random().toString(36).substring(2, 9);
let localPlayerName = "";
let isHost = false;
let currentGameStatus = "lobby"; // lobby, active, finished
let activeCard = null;
let cardTimer = null;
let remainingSeconds = 60;
let placementTimer = null;
let placementSeconds = 10;
let isMyPlacementTurn = false;
let myScore = 0;
let myBingos = 0;
let myBoard = Array(9).fill(null); // 3x3 보드 상태 (0~8)

// 카드 덱 상태
let cardDeck = [];
let drawnCardsCount = 0;

// 가상 시뮬레이션용 변수 (Firestore 연결 안됐을 시 작동)
let virtualEngine = null;

// ============================================================================
// 2. WEB AUDIO API EFFECT SYNTHESIZER
// ============================================================================
const AudioFX = {
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playClick() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playClaim() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start();
        osc.stop(now + 0.45);
    },

    playExplosion() {
        this.init();
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // 노이즈 버퍼 생성
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(10, now + 0.4);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start();
        noiseNode.stop(now + 0.45);
    },

    playBingo() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
        
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + index * 0.08);

            gain.gain.setValueAtTime(0.08, now + index * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.08 + 0.15);

            osc.start(now + index * 0.08);
            osc.stop(now + index * 0.08 + 0.18);
        });
    }
};

// ============================================================================
// 3. CANVAS 2D NEON PARTICLE SYSTEM
// ============================================================================
const CanvasFX = {
    canvas: null,
    ctx: null,
    particles: [],

    init() {
        this.canvas = document.getElementById("effects-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.resize();
        window.addEventListener("resize", () => this.resize());
        this.loop();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createExplosion(x, y, color = "#ff007f") {
        const count = 40;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 4;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 2,
                color,
                alpha: 1,
                decay: Math.random() * 0.02 + 0.015,
                gravity: 0.1
            });
        }
    },

    createBingoCelebration() {
        const colors = ["#ff007f", "#00f0ff", "#39ff14", "#fff000"];
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        for (let burst = 0; burst < 3; burst++) {
            setTimeout(() => {
                const x = screenWidth * (0.25 + Math.random() * 0.5);
                const y = screenHeight * (0.25 + Math.random() * 0.5);
                const color = colors[Math.floor(Math.random() * colors.length)];
                this.createExplosion(x, y, color);
            }, burst * 200);
        }
    },

    loop() {
        requestAnimationFrame(() => this.loop());
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }
};

// ============================================================================
// 4. BINGO & 'CONSECUTIVE NUMBER PLACEMENT' JUDGE LOGIC
// ============================================================================
const BingoJudge = {
    lines: [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // 가로
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // 세로
        [0, 4, 8], [2, 4, 6]             // 대각선
    ],

    evaluate(board) {
        let totalScore = 0;
        let bingoCount = 0;
        let highlightedCells = new Set();
        let checkedLines = [];

        this.lines.forEach((line) => {
            const [i1, i2, i3] = line;
            const c1 = board[i1];
            const c2 = board[i2];
            const c3 = board[i3];

            if (c1 && c2 && c3) {
                let matchType = null;

                if (c1.a === c2.a && c2.a === c3.a) {
                    matchType = 'a';
                }
                else if (c1.b === c2.b && c2.b === c3.b) {
                    matchType = 'b';
                }
                else if (c1.x_int === c2.x_int && c2.x_int === c3.x_int) {
                    matchType = 'x_int';
                }

                if (matchType) {
                    bingoCount++;
                    totalScore += 100;
                    line.forEach(idx => highlightedCells.add(idx));

                    let hasSequence = false;
                    let targetProps = [];

                    if (matchType === 'a') {
                        targetProps = ['b', 'x_int'];
                    } else if (matchType === 'b') {
                        targetProps = ['a', 'x_int'];
                    } else {
                        targetProps = ['a', 'b'];
                    }

                    for (let prop of targetProps) {
                        const v1 = c1[prop];
                        const v2 = c2[prop];
                        const v3 = c3[prop];

                        const ascending = (v1 < v2 && v2 < v3);
                        const descending = (v1 > v2 && v2 > v3);

                        if (ascending || descending) {
                            hasSequence = true;
                            break;
                        }
                    }

                    if (hasSequence) {
                        totalScore += 30;
                    }

                    checkedLines.push({ line, matchType, hasSequence });
                }
            }
        });

        return {
            bingoCount,
            score: totalScore,
            highlightedCells: Array.from(highlightedCells),
            checkedLines
        };
    }
};

// ============================================================================
// 5. LOCAL VIRTUAL MULTI-PLAYER SIMULATOR (MOCK & TABS BC)
// ============================================================================
class VirtualMultiplayerEngine {
    constructor() {
        this.players = [];
        this.initVirtualPlayers();
        this.localInterval = null;
    }

    initVirtualPlayers() {
        const names = ["민수", "영희", "지훈", "서연", "예준", "유진", "도윤", "하은", "주원", "지우", "현우"];
        this.players = names.map((name, idx) => ({
            id: `virtual_player_${idx}`,
            name,
            score: 0,
            bingos: 0,
            board: Array(9).fill(null),
            online: true
        }));
    }

    start() {
        cardDeck = [...INITIAL_CARD_DECK];
        this.shuffle(cardDeck);
        drawnCardsCount = 0;
        currentGameStatus = "active";
        updateAdminViews();

        this.drawNextCard();

        this.localInterval = setInterval(() => {
            this.tick();
        }, 1000);
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    drawNextCard() {
        if (drawnCardsCount >= cardDeck.length) {
            this.stop();
            currentGameStatus = "finished";
            this.broadcastGameState();
            alert("모든 카드가 소진되었습니다! 게임 종료.");
            location.reload();
            return;
        }

        activeCard = cardDeck[drawnCardsCount++];
        activeCard.claimedBy = null;
        activeCard.claimedByName = null;
        activeCard.status = "active";
        remainingSeconds = 60;

        startCardTimer();
        renderActiveCard();
        updateAdminViews();
        
        // 탭 간 상태 브로드캐스트
        this.broadcastGameState();
    }

    claimCardByVirtualPlayer(player) {
        if (activeCard.status !== "active") return;

        activeCard.status = "claimed";
        activeCard.claimedBy = player.id;
        activeCard.claimedByName = player.name;
        
        clearInterval(cardTimer);
        renderActiveCard();
        updateAdminViews();
        this.broadcastGameState();

        setTimeout(() => {
            if (activeCard && activeCard.claimedBy === player.id) {
                const emptyIndices = player.board.reduce((acc, cell, idx) => {
                    if (cell === null) acc.push(idx);
                    return acc;
                }, []);

                if (emptyIndices.length > 0) {
                    const placeIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
                    player.board[placeIndex] = activeCard;
                    
                    const result = BingoJudge.evaluate(player.board);
                    player.score = result.score;
                    player.bingos = result.bingoCount;

                    if (result.bingoCount > 0) {
                        triggerScreenShake();
                    }
                }
                
                this.drawNextCard();
            }
        }, 1000 + Math.random() * 3000);
    }

    claimCardByRealPlayer(playerId, playerName) {
        if (activeCard.status !== "active") return;

        activeCard.status = "claimed";
        activeCard.claimedBy = playerId;
        activeCard.claimedByName = playerName;
        
        clearInterval(cardTimer);
        renderActiveCard();
        updateAdminViews();
        this.broadcastGameState();

        // 실시간 클라이언트측 10초 스케줄링 대응용
        this.claimTimeoutTimer = setTimeout(() => {
            if (activeCard && activeCard.claimedBy === playerId && activeCard.status === "claimed") {
                // 10초 동안 배치 안 했을 시 복구
                activeCard.status = "active";
                activeCard.claimedBy = null;
                activeCard.claimedByName = null;
                startCardTimer();
                renderActiveCard();
                updateAdminViews();
                this.broadcastGameState();
            }
        }, 10500);
    }

    placeCardByRealPlayer(playerId, board, score, bingos) {
        if (!activeCard || activeCard.claimedBy !== playerId) return;

        clearTimeout(this.claimTimeoutTimer);

        // 로컬 엔진 플레이어 리스트 업데이트
        const p = this.players.find(pl => pl.id === playerId);
        if (p) {
            p.board = board;
            p.score = score;
            p.bingos = bingos;
        }

        this.drawNextCard();
    }

    tick() {
        if (currentGameStatus !== "active") return;

        // 가상 유저들의 선점 시뮬레이션
        if (activeCard && activeCard.status === "active") {
            const chance = remainingSeconds <= 20 ? 0.15 : 0.02;
            if (Math.random() < chance) {
                const onlinePlayers = this.players.filter(p => p.online && p.id !== localPlayerId);
                if (onlinePlayers.length > 0) {
                    const randomPlayer = onlinePlayers[Math.floor(Math.random() * onlinePlayers.length)];
                    const isFull = randomPlayer.board.every(cell => cell !== null);
                    if (!isFull) {
                        this.claimCardByVirtualPlayer(randomPlayer);
                    }
                }
            }
        }
        
        // 1초 주기로 시간 동기화 전송
        this.broadcastGameState();
    }

    broadcastGameState() {
        if (localChannel) {
            localChannel.postMessage({
                type: 'STATE_UPDATE',
                currentGameStatus,
                drawnCardsCount,
                activeCard,
                remainingSeconds,
                players: this.players
            });
        }
    }

    stop() {
        clearInterval(this.localInterval);
        clearInterval(cardTimer);
    }
}

// ============================================================================
// 6. UI RENDERERS & ANIMATORS
// ============================================================================
let graphRenderer = null;

function initUI() {
    graphRenderer = new NeonGraphRenderer("current-graph-container");
    CanvasFX.init();

    const cells = document.querySelectorAll(".board-cell");
    cells.forEach(cell => {
        cell.addEventListener("click", () => handleBoardCellClick(parseInt(cell.dataset.index)));
    });

    document.getElementById("btn-join").addEventListener("click", handleJoinGame);
    document.getElementById("btn-claim-card").addEventListener("click", handleClaimCard);
    document.getElementById("btn-toggle-config").addEventListener("click", () => {
        document.getElementById("modal-fb-config").classList.add("active");
    });
    document.getElementById("btn-close-config").addEventListener("click", () => {
        document.getElementById("modal-fb-config").classList.remove("active");
    });
    document.getElementById("btn-save-config").addEventListener("click", handleSaveFirebaseConfig);
    
    document.getElementById("btn-admin-gate").addEventListener("click", () => {
        document.getElementById("modal-admin-login").classList.add("active");
    });
    document.getElementById("btn-close-admin").addEventListener("click", () => {
        document.getElementById("modal-admin-login").classList.remove("active");
    });
    document.getElementById("btn-admin-login").addEventListener("click", handleAdminLogin);
    
    document.getElementById("btn-admin-start").addEventListener("click", handleAdminStartGame);
    document.getElementById("btn-admin-next").addEventListener("click", handleAdminNextCard);
    document.getElementById("btn-admin-reset").addEventListener("click", handleAdminResetGame);
    document.getElementById("btn-admin-exit").addEventListener("click", handleAdminLogout);

    // BroadcastChannel 메세지 리스너 바인딩 (탭 동기화)
    if (localChannel) {
        localChannel.onmessage = handleChannelMessage;
    }

    loadStoredFirebaseConfig();
}

/**
 * 60초 타이머 동작
 */
function startCardTimer() {
    clearInterval(cardTimer);
    const timerBar = document.getElementById("timer-bar");
    const timerSeconds = document.getElementById("timer-seconds");

    timerBar.classList.remove("timer-warn");

    cardTimer = setInterval(() => {
        remainingSeconds--;
        timerSeconds.textContent = remainingSeconds;
        timerBar.style.width = `${(remainingSeconds / 60) * 100}%`;

        if (remainingSeconds <= 20) {
            timerBar.classList.add("timer-warn");
            document.getElementById("card-hint-panel").classList.add("reveal");
            if (activeCard) {
                graphRenderer.draw(activeCard, true);
                document.getElementById("hint-slope").textContent = activeCard.a;
                document.getElementById("hint-y-int").textContent = activeCard.b;
                document.getElementById("hint-x-int").textContent = activeCard.x_int;
            }
        } else {
            document.getElementById("card-hint-panel").classList.remove("reveal");
        }

        if (remainingSeconds <= 0) {
            clearInterval(cardTimer);
            handleCardTimeout();
        }
    }, 1000);
}

function handleCardTimeout() {
    AudioFX.playExplosion();
    const cardEl = document.getElementById("game-card-screen");
    const rect = cardEl.getBoundingClientRect();
    CanvasFX.createExplosion(rect.left + rect.width/2, rect.top + rect.height/2, "#ff3333");
    triggerScreenShake();

    if (isFirebaseMode) {
        if (isHost) {
            db.collection("game_state").doc("current").set({
                cardId: null,
                status: "exploded",
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).then(() => {
                setTimeout(() => adminDrawNextCard(), 1500);
            });
        }
    } else {
        if (isHost && virtualEngine) {
            setTimeout(() => {
                virtualEngine.drawNextCard();
            }, 1500);
        }
    }
}

/**
 * 10초 배치 카운트다운 타이머
 */
function startPlacementTimer() {
    clearInterval(placementTimer);
    placementSeconds = 10;
    
    const overlay = document.getElementById("placement-timer-overlay");
    const timerText = document.getElementById("placement-seconds");
    
    overlay.classList.add("active");
    timerText.textContent = placementSeconds;
    document.querySelector(".workspace-right").classList.add("placement-active");

    placementTimer = setInterval(() => {
        placementSeconds--;
        timerText.textContent = placementSeconds;

        if (placementSeconds <= 0) {
            clearInterval(placementTimer);
            handlePlacementTimeout();
        }
    }, 1000);
}

function handlePlacementTimeout() {
    document.getElementById("placement-timer-overlay").classList.remove("active");
    document.querySelector(".workspace-right").classList.remove("placement-active");
    isMyPlacementTurn = false;

    AudioFX.playExplosion();
    triggerScreenShake();

    if (isFirebaseMode) {
        db.collection("game_state").doc("current").update({
            claimedBy: null,
            claimedByName: null,
            status: "active"
        });
    } else {
        // 호스트 채널에 타임아웃 통보하여 복구
        if (localChannel) {
            localChannel.postMessage({ type: 'PLACEMENT_TIMEOUT', playerId: localPlayerId });
        }
    }
}

function triggerScreenShake() {
    const wrapper = document.getElementById("game-container-wrapper");
    wrapper.classList.add("shake");
    setTimeout(() => {
        wrapper.classList.remove("shake");
    }, 300);
}

/**
 * 중앙 카드 렌더링
 */
function renderActiveCard() {
    const screen = document.getElementById("game-card-screen");
    const formulaText = document.getElementById("card-formula-text");
    const statusBadge = document.getElementById("card-status-badge");
    const claimBtn = document.getElementById("btn-claim-card");

    screen.className = "card-screen neon-border-cyan";
    
    if (!isMyPlacementTurn) {
        document.getElementById("placement-timer-overlay").classList.remove("active");
        document.querySelector(".workspace-right").classList.remove("placement-active");
    }

    if (!activeCard || activeCard.status === "exploded" || activeCard.status === "ready_to_draw") {
        formulaText.textContent = "STANDBY";
        statusBadge.textContent = "WAITING";
        claimBtn.disabled = true;
        document.getElementById("current-graph-container").innerHTML = "";
        document.getElementById("card-hint-panel").classList.remove("reveal");
        return;
    }

    formulaText.textContent = activeCard.formula;

    const showHints = remainingSeconds <= 20;
    graphRenderer.draw(activeCard, showHints);

    if (showHints) {
        document.getElementById("card-hint-panel").classList.add("reveal");
        document.getElementById("hint-slope").textContent = activeCard.a;
        document.getElementById("hint-y-int").textContent = activeCard.b;
        document.getElementById("hint-x-int").textContent = activeCard.x_int;
    } else {
        document.getElementById("card-hint-panel").classList.remove("reveal");
    }

    if (activeCard.status === "claimed") {
        if (activeCard.claimedBy === localPlayerId) {
            statusBadge.textContent = "MY CLAIMED";
            claimBtn.disabled = true;
            if (!isMyPlacementTurn) {
                isMyPlacementTurn = true;
                startPlacementTimer();
            }
        } else {
            screen.classList.add("claimed-by-other");
            statusBadge.textContent = `${activeCard.claimedByName} 선점 중`;
            claimBtn.disabled = true;
        }
    } else {
        statusBadge.textContent = "READY";
        const boardFull = myBoard.every(cell => cell !== null);
        claimBtn.disabled = boardFull || currentGameStatus !== "active";
    }
}

/**
 * 3x3 보드 렌더링
 */
function renderMyBoard() {
    const cells = document.querySelectorAll(".board-cell");
    const evaluation = BingoJudge.evaluate(myBoard);

    myScore = evaluation.score;
    myBingos = evaluation.bingoCount;
    document.getElementById("game-my-score").textContent = String(myScore).padStart(4, "0");
    document.getElementById("game-my-bingos").textContent = myBingos;

    cells.forEach((cell, idx) => {
        const card = myBoard[idx];
        cell.className = "board-cell";
        
        if (evaluation.highlightedCells.includes(idx)) {
            cell.classList.add("bingo-highlight");
        }

        if (card) {
            cell.classList.add("filled");
            cell.innerHTML = `
                <div class="cell-formula">${card.formula}</div>
                <div class="cell-properties">
                    <div class="prop-item">기울기 <span>${card.a}</span></div>
                    <div class="prop-item">y절편 <span>${card.b}</span></div>
                    <div class="prop-item">x절편 <span>${card.x_int}</span></div>
                </div>
            `;
        } else {
            cell.innerHTML = "";
        }
    });

    if (isFirebaseMode) {
        db.collection("players").doc(localPlayerId).update({
            board: myBoard.map(c => c ? { id: c.id, formula: c.formula, a: c.a, b: c.b, x_int: c.x_int } : null),
            score: myScore,
            bingos: myBingos
        });
    } else {
        // 로컬 브로드캐스트 전송
        if (localChannel) {
            localChannel.postMessage({
                type: 'PLAYER_BOARD_UPDATE',
                playerId: localPlayerId,
                name: localPlayerName,
                board: myBoard,
                score: myScore,
                bingos: myBingos
            });
        }
    }
}

/**
 * 관리자 대시보드 뷰 갱신
 */
function updateAdminViews() {
    if (!isHost) return;

    document.getElementById("admin-game-status").textContent = 
        currentGameStatus === "active" ? "진행 중" : (currentGameStatus === "finished" ? "게임 종료" : "대기실");
    document.getElementById("admin-cards-left").textContent = `${32 - drawnCardsCount} / 32`;
    document.getElementById("admin-current-formula").textContent = activeCard ? activeCard.formula : "없음";
    document.getElementById("admin-current-claimant").textContent = activeCard && activeCard.claimedBy ? activeCard.claimedByName : "없음";

    document.getElementById("btn-admin-next").disabled = (currentGameStatus !== "active");

    const grid = document.getElementById("admin-players-grid");
    grid.innerHTML = "";

    const allPlayers = isFirebaseMode 
        ? Object.values(firestorePlayersMap) 
        : (virtualEngine ? virtualEngine.players : []);

    document.getElementById("admin-player-count").textContent = `접속 인원: ${allPlayers.length} / 12`;

    allPlayers.forEach(p => {
        const hasBingo = p.bingos > 0;
        const cardClass = `player-dashboard-card ${p.online ? 'online' : ''} ${hasBingo ? 'has-bingo' : ''}`;
        
        let miniGridHTML = `<div class="mini-board-grid">`;
        for (let i = 0; i < 9; i++) {
            const cell = p.board[i];
            let cellClass = "mini-cell";
            if (cell) cellClass += " filled";
            miniGridHTML += `<div class="${cellClass}"></div>`;
        }
        miniGridHTML += `</div>`;

        const card = document.createElement("div");
        card.className = cardClass;
        card.innerHTML = `
            <div class="card-head">
                <span class="p-name">${p.name}</span>
                <span class="p-status"></span>
            </div>
            <div class="p-scores">
                <span>점수: <strong>${p.score}</strong></span>
                <span>빙고: <strong>${p.bingos}</strong></span>
            </div>
            ${miniGridHTML}
        `;
        grid.appendChild(card);
    });
}

// ============================================================================
// 7. USER INTERACTION HANDLERS
// ============================================================================

function handleJoinGame() {
    const input = document.getElementById("player-nickname");
    const nickname = input.value.trim();

    if (!nickname) {
        alert("닉네임을 입력해 주세요.");
        return;
    }

    localPlayerName = nickname;
    AudioFX.playClick();

    if (isFirebaseMode) {
        db.collection("players").doc(localPlayerId).set({
            id: localPlayerId,
            name: localPlayerName,
            score: 0,
            bingos: 0,
            board: Array(9).fill(null),
            online: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            document.getElementById("view-lobby").classList.remove("active");
            document.getElementById("view-game").classList.add("active");
            document.getElementById("game-my-name").textContent = localPlayerName;
            listenToGameState();
        });
    } else {
        document.getElementById("view-lobby").classList.remove("active");
        document.getElementById("view-game").classList.add("active");
        document.getElementById("game-my-name").textContent = localPlayerName;
        
        // 채널을 통해 호스트에게 가입 요청 전송
        if (localChannel) {
            localChannel.postMessage({
                type: 'JOIN_REQUEST',
                playerId: localPlayerId,
                name: localPlayerName
            });
        }
        
        renderMyBoard();
        renderActiveCard();
    }
}

function handleClaimCard() {
    if (!activeCard || activeCard.status !== "active") return;
    AudioFX.playClick();

    if (isFirebaseMode) {
        const currentRef = db.collection("game_state").doc("current");
        db.runTransaction((transaction) => {
            return transaction.get(currentRef).then((sfDoc) => {
                if (!sfDoc.exists) throw "Document does not exist!";
                const data = sfDoc.data();
                if (data.status !== "active" || data.claimedBy) {
                    return Promise.reject("이미 다른 사람이 선점했습니다!");
                }
                
                transaction.update(currentRef, {
                    status: "claimed",
                    claimedBy: localPlayerId,
                    claimedByName: localPlayerName,
                    claimedAt: Date.now()
                });
                return "success";
            });
        }).then(() => {
            AudioFX.playClaim();
        }).catch(err => alert(err));
    } else {
        // 로컬 모드: 호스트에게 선점 요청
        if (localChannel) {
            localChannel.postMessage({
                type: 'CLAIM_REQUEST',
                playerId: localPlayerId,
                name: localPlayerName
            });
        }
    }
}

function handleBoardCellClick(index) {
    if (!isMyPlacementTurn) return;
    if (myBoard[index] !== null) {
        alert("이미 카드가 배치된 칸입니다.");
        return;
    }

    AudioFX.playClick();

    clearInterval(placementTimer);
    document.getElementById("placement-timer-overlay").classList.remove("active");
    document.querySelector(".workspace-right").classList.remove("placement-active");
    isMyPlacementTurn = false;

    myBoard[index] = activeCard;
    const prevBingoCount = myBingos;
    renderMyBoard();

    const evaluation = BingoJudge.evaluate(myBoard);
    if (evaluation.bingoCount > prevBingoCount) {
        AudioFX.playBingo();
        CanvasFX.createBingoCelebration();
        triggerScreenShake();
    }

    if (isFirebaseMode) {
        db.collection("game_state").doc("current").update({
            cardId: null,
            status: "ready_to_draw"
        });
    } else {
        // 호스트에게 배치 완료 상태 전송
        if (localChannel) {
            localChannel.postMessage({
                type: 'PLACE_SUCCESS',
                playerId: localPlayerId,
                board: myBoard,
                score: myScore,
                bingos: myBingos
            });
        }
    }
}

// ============================================================================
// 8. ADMIN DASHBOARD & CONTROLS HANDLERS
// ============================================================================

function handleAdminLogin() {
    const pw = document.getElementById("admin-password").value;
    if (pw === "admin123") {
        isHost = true;
        document.getElementById("modal-admin-login").classList.remove("active");
        document.getElementById("view-lobby").classList.remove("active");
        document.getElementById("view-admin").classList.add("active");
        AudioFX.playClick();

        if (isFirebaseMode) {
            listenToAdminState();
        } else {
            if (!virtualEngine) {
                virtualEngine = new VirtualMultiplayerEngine();
            }
            updateAdminViews();
        }
    } else {
        alert("비밀번호가 일치하지 않습니다.");
    }
}

function handleAdminLogout() {
    isHost = false;
    document.getElementById("view-admin").classList.remove("active");
    document.getElementById("view-lobby").classList.add("active");
}

function handleAdminStartGame() {
    if (isFirebaseMode) {
        db.collection("game_state").doc("current").set({
            status: "active",
            cardId: null,
            deck: INITIAL_CARD_DECK.sort(() => Math.random() - 0.5),
            drawnCount: 0
        }).then(() => adminDrawNextCard());
    } else {
        virtualEngine.start();
    }
}

function handleAdminNextCard() {
    if (isFirebaseMode) {
        adminDrawNextCard();
    } else {
        virtualEngine.drawNextCard();
    }
}

function handleAdminResetGame() {
    if (confirm("정말로 모든 게임 데이터를 리셋하시겠습니까?")) {
        if (isFirebaseMode) {
            db.collection("game_state").doc("current").delete();
            db.collection("players").get().then((snapshot) => {
                const batch = db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                return batch.commit();
            }).then(() => location.reload());
        } else {
            location.reload();
        }
    }
}

function adminDrawNextCard() {
    if (!isHost) return;

    const docRef = db.collection("game_state").doc("current");
    db.runTransaction((transaction) => {
        return transaction.get(docRef).then((sfDoc) => {
            if (!sfDoc.exists) throw "Game not initialized";
            const data = sfDoc.data();
            const deck = data.deck;
            const drawnCount = data.drawnCount;

            if (drawnCount >= deck.length) {
                return Promise.reject("All cards drawn");
            }

            const nextCard = deck[drawnCount];
            transaction.update(docRef, {
                cardId: nextCard.id,
                formula: nextCard.formula,
                a: nextCard.a,
                b: nextCard.b,
                x_int: nextCard.x_int,
                status: "active",
                claimedBy: null,
                claimedByName: null,
                drawnCount: drawnCount + 1,
                createdAt: Date.now()
            });
            return "drawn";
        });
    }).then(() => AudioFX.playClick()).catch(err => alert(err));
}

// ============================================================================
// 9. MULTIPLAYER CHANNEL MESSAGE RECEIVER (TAB-TO-TAB FOR LOCAL MODE)
// ============================================================================
function handleChannelMessage(e) {
    if (isFirebaseMode) return; // 파이어베이스 활성화 시 채널 통신 생략

    const msg = e.data;

    if (isHost && virtualEngine) {
        // 호스트(관리자) 탭이 수신하는 이벤트
        switch (msg.type) {
            case 'JOIN_REQUEST':
                // 가입 처리
                const exist = virtualEngine.players.find(p => p.id === msg.playerId);
                if (!exist) {
                    virtualEngine.players.unshift({
                        id: msg.playerId,
                        name: msg.name,
                        score: 0,
                        bingos: 0,
                        board: Array(9).fill(null),
                        online: true
                    });
                } else {
                    exist.online = true;
                }
                virtualEngine.broadcastGameState();
                updateAdminViews();
                break;
                
            case 'CLAIM_REQUEST':
                // 선점 요청 처리 (선점 경쟁)
                virtualEngine.claimCardByRealPlayer(msg.playerId, msg.playerName);
                break;
                
            case 'PLACE_SUCCESS':
                // 배치 완료 처리
                virtualEngine.placeCardByRealPlayer(msg.playerId, msg.board, msg.score, msg.bingos);
                break;
                
            case 'PLACEMENT_TIMEOUT':
                // 10초 내 미배치 시 상태 복원
                if (activeCard && activeCard.claimedBy === msg.playerId) {
                    activeCard.status = "active";
                    activeCard.claimedBy = null;
                    activeCard.claimedByName = null;
                    startCardTimer();
                    renderActiveCard();
                    updateAdminViews();
                    virtualEngine.broadcastGameState();
                }
                break;
                
            case 'PLAYER_BOARD_UPDATE':
                // 단순 보드 변경 사항 모니터링 갱신
                const p = virtualEngine.players.find(pl => pl.id === msg.playerId);
                if (p) {
                    p.board = msg.board;
                    p.score = msg.score;
                    p.bingos = msg.bingos;
                    updateAdminViews();
                }
                break;
        }
    } else {
        // 참가자(플레이어) 탭이 수신하는 이벤트
        switch (msg.type) {
            case 'STATE_UPDATE':
                currentGameStatus = msg.currentGameStatus;
                drawnCardsCount = msg.drawnCardsCount;
                
                // 남은 카드수 프로그레스 바 갱신
                const total = 32;
                const progress = ((total - drawnCardsCount) / total) * 100;
                document.getElementById("game-cards-progress").style.width = `${progress}%`;
                document.getElementById("game-cards-left").textContent = `${total - drawnCardsCount} / ${total}`;

                if (msg.activeCard) {
                    // 카드가 변경되었거나 갱신된 경우
                    if (!activeCard || activeCard.id !== msg.activeCard.id) {
                        activeCard = msg.activeCard;
                        remainingSeconds = msg.remainingSeconds;
                        startCardTimer();
                    } else {
                        // 선점 상황 변화 감지
                        const wasClaimedByMe = activeCard.claimedBy === localPlayerId;
                        activeCard.status = msg.activeCard.status;
                        activeCard.claimedBy = msg.activeCard.claimedBy;
                        activeCard.claimedByName = msg.activeCard.claimedByName;

                        // 선점 획득 효과음 재생
                        if (activeCard.status === "claimed" && activeCard.claimedBy === localPlayerId && !wasClaimedByMe) {
                            AudioFX.playClaim();
                        }
                    }
                    renderActiveCard();
                } else {
                    activeCard = null;
                    clearInterval(cardTimer);
                    renderActiveCard();
                }
                break;
        }
    }
}

// ============================================================================
// 10. FIREBASE REAL-TIME LISTENERS
// ============================================================================
let firestorePlayersMap = {};

function listenToGameState() {
    if (!db) return;

    db.collection("game_state").doc("current").onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();

        currentGameStatus = data.status;
        drawnCardsCount = data.drawnCount || 0;
        
        const total = 32;
        const progress = ((total - drawnCardsCount) / total) * 100;
        document.getElementById("game-cards-progress").style.width = `${progress}%`;
        document.getElementById("game-cards-left").textContent = `${total - drawnCardsCount} / ${total}`;

        if (data.cardId) {
            if (!activeCard || activeCard.id !== data.cardId) {
                activeCard = {
                    id: data.cardId,
                    formula: data.formula,
                    a: data.a,
                    b: data.b,
                    x_int: data.x_int,
                    status: data.status,
                    claimedBy: data.claimedBy,
                    claimedByName: data.claimedByName
                };
                
                const elapsedMs = Date.now() - (data.createdAt || Date.now());
                remainingSeconds = Math.max(0, 60 - Math.floor(elapsedMs / 1000));
                
                startCardTimer();
                renderActiveCard();
            } else {
                const wasClaimedByMe = activeCard.claimedBy === localPlayerId;
                activeCard.status = data.status;
                activeCard.claimedBy = data.claimedBy;
                activeCard.claimedByName = data.claimedByName;

                if (activeCard.status === "claimed" && activeCard.claimedBy === localPlayerId && !wasClaimedByMe) {
                    AudioFX.playClaim();
                }
                
                renderActiveCard();
            }
        } else {
            activeCard = null;
            clearInterval(cardTimer);
            renderActiveCard();
        }
    });
}

function listenToAdminState() {
    if (!db || !isHost) return;

    db.collection("game_state").doc("current").onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        currentGameStatus = data.status;
        drawnCardsCount = data.drawnCount || 0;
        
        if (data.cardId) {
            activeCard = {
                formula: data.formula,
                status: data.status,
                claimedBy: data.claimedBy,
                claimedByName: data.claimedByName
            };
        } else {
            activeCard = null;
        }
        updateAdminViews();
    });

    db.collection("players").onSnapshot((snapshot) => {
        firestorePlayersMap = {};
        snapshot.forEach(doc => {
            const p = doc.data();
            firestorePlayersMap[p.id] = p;
        });
        updateAdminViews();
    });
}

// ============================================================================
// 11. LOCAL STORAGE FIREBASE CONFIG HANDLERS
// ============================================================================

function handleSaveFirebaseConfig() {
    const config = {
        apiKey: document.getElementById("config-apiKey").value.trim(),
        authDomain: document.getElementById("config-authDomain").value.trim(),
        projectId: document.getElementById("config-projectId").value.trim(),
        storageBucket: document.getElementById("config-storageBucket").value.trim(),
        messagingSenderId: document.getElementById("config-messagingSenderId").value.trim(),
        appId: document.getElementById("config-appId").value.trim()
    };

    if (config.apiKey && config.projectId) {
        localStorage.setItem("fb_bingo_config", JSON.stringify(config));
        alert("Firebase 연동 정보가 로컬 스토리지에 저장되었습니다. 새로고침 후 적용됩니다.");
        location.reload();
    } else {
        alert("최소 apiKey와 projectId는 필수로 입력해야 합니다.");
    }
}

function loadStoredFirebaseConfig() {
    const stored = localStorage.getItem("fb_bingo_config");
    if (stored) {
        try {
            const config = JSON.parse(stored);
            
            document.getElementById("config-apiKey").value = config.apiKey || "";
            document.getElementById("config-authDomain").value = config.authDomain || "";
            document.getElementById("config-projectId").value = config.projectId || "";
            document.getElementById("config-storageBucket").value = config.storageBucket || "";
            document.getElementById("config-messagingSenderId").value = config.messagingSenderId || "";
            document.getElementById("config-appId").value = config.appId || "";

            // Firebase SDK 초기화
            const script = document.createElement("script");
            script.src = "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
            script.onload = () => {
                const fsScript = document.createElement("script");
                fsScript.src = "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js";
                fsScript.onload = () => {
                    firebase.initializeApp(config);
                    db = firebase.firestore();
                    isFirebaseMode = true;
                    
                    const badge = document.getElementById("fb-status-badge");
                    badge.className = "firebase-status-badge online";
                    badge.querySelector("span").textContent = "Firebase Firestore 온라인";
                };
                document.head.appendChild(fsScript);
            };
            document.head.appendChild(script);

        } catch (e) {
            console.error("Firebase 초기화 에러: ", e);
            alert("Firebase 구성 정보가 올바르지 않아 로컬 모드로 동작합니다.");
        }
    }
}

// ============================================================================
// 12. TESTING & DEBUGGING HELPERS
// ============================================================================

window.testBingoLogic = function() {
    console.log("=== 빙고 판정 단위 테스트 구동 ===");
    
    const testBoard1 = Array(9).fill(null);
    testBoard1[0] = { formula: "y = 2x - 4", a: 2, b: -4, x_int: 2 };
    testBoard1[1] = { formula: "y = 2x - 3", a: 2, b: -3, x_int: 1.5 };
    testBoard1[2] = { formula: "y = 2x + 2", a: 2, b: 2, x_int: -1 };

    const res1 = BingoJudge.evaluate(testBoard1);
    console.log("테스트 1 결과 (기울기 일치 가로 빙고 + 오름차순 보너스):");
    console.log(`빙고 개수: ${res1.bingoCount} (기대값: 1)`);
    console.log(`획득 점수: ${res1.score} (기대값: 130)`);
    console.log(`하이라이트 셀:`, res1.highlightedCells);
    console.log(`디테일:`, res1.checkedLines);

    const testBoard2 = Array(9).fill(null);
    testBoard2[2] = { formula: "y = x + 4", a: 1, b: 4, x_int: -4 };
    testBoard2[4] = { formula: "y = 2x + 4", a: 2, b: 4, x_int: -2 };
    testBoard2[6] = { formula: "y = 3x + 4", a: 3, b: 4, x_int: -1.33 };

    const res2 = BingoJudge.evaluate(testBoard2);
    console.log("\n테스트 2 결과 (y절편 일치 대각선 빙고 + 오름차순 보너스):");
    console.log(`빙고 개수: ${res2.bingoCount} (기대값: 1)`);
    console.log(`획득 점수: ${res2.score} (기대값: 130)`);
    
    const testBoard3 = Array(9).fill(null);
    testBoard3[0] = { formula: "y = 3x - 6", a: 3, b: -6, x_int: 2 };
    testBoard3[3] = { formula: "y = 2x - 4", a: 2, b: -4, x_int: 2 };
    testBoard3[6] = { formula: "y = 4x - 8", a: 4, b: -8, x_int: 2 };

    const res3 = BingoJudge.evaluate(testBoard3);
    console.log("\n테스트 3 결과 (x절편 일치 세로 빙고 + 정렬 보너스 미충족):");
    console.log(`빙고 개수: ${res3.bingoCount} (기대값: 1)`);
    console.log(`획득 점수: ${res3.score} (기대값: 100)`);
};

window.addEventListener("DOMContentLoaded", initUI);
