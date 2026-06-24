// 일차함수 빙고 카드 데이터셋 및 SVG 그래프 렌더러

/**
 * 32장의 일차함수 카드 덱 정의
 * 조건: 기울기(a), y절편(b), x절편(-b/a) 중 최소 2개 이상이 정수인 카드들.
 */
const INITIAL_CARD_DECK = [
    { id: "card_01", formula: "y = 2x - 4", a: 2, b: -4, x_int: 2 },
    { id: "card_02", formula: "y = -x + 3", a: -1, b: 3, x_int: 3 },
    { id: "card_03", formula: "y = 0.5x + 2", a: 0.5, b: 2, x_int: -4 },
    { id: "card_04", formula: "y = -0.5x - 1", a: -0.5, b: -1, x_int: -2 },
    { id: "card_05", formula: "y = 3x - 6", a: 3, b: -6, x_int: 2 },
    { id: "card_06", formula: "y = -2x + 6", a: -2, b: 6, x_int: 3 },
    { id: "card_07", formula: "y = 1.5x - 3", a: 1.5, b: -3, x_int: 2 },
    { id: "card_08", formula: "y = -1.5x + 3", a: -1.5, b: 3, x_int: 2 },
    { id: "card_09", formula: "y = 0.25x - 1", a: 0.25, b: -1, x_int: 4 },
    { id: "card_10", formula: "y = -0.25x + 2", a: -0.25, b: 2, x_int: 8 },
    { id: "card_11", formula: "y = 4x + 4", a: 4, b: 4, x_int: -1 },
    { id: "card_12", formula: "y = -3x - 3", a: -3, b: -3, x_int: -1 },
    { id: "card_13", formula: "y = 0.5x - 3", a: 0.5, b: -3, x_int: 6 },
    { id: "card_14", formula: "y = -0.5x + 4", a: -0.5, b: 4, x_int: 8 },
    { id: "card_15", formula: "y = 2x + 6", a: 2, b: 6, x_int: -3 },
    { id: "card_16", formula: "y = -2x - 4", a: -2, b: -4, x_int: -2 },
    { id: "card_17", formula: "y = x - 5", a: 1, b: -5, x_int: 5 },
    { id: "card_18", formula: "y = -x - 2", a: -1, b: -2, x_int: -2 },
    { id: "card_19", formula: "y = 0.4x - 2", a: 0.4, b: -2, x_int: 5 },
    { id: "card_20", formula: "y = -0.4x + 2", a: -0.4, b: 2, x_int: 5 },
    { id: "card_21", formula: "y = 2.5x - 5", a: 2.5, b: -5, x_int: 2 },
    { id: "card_22", formula: "y = -2.5x + 5", a: -2.5, b: 5, x_int: 2 },
    { id: "card_23", formula: "y = 0.8x - 4", a: 0.8, b: -4, x_int: 5 },
    { id: "card_24", formula: "y = -0.8x + 4", a: -0.8, b: 4, x_int: 5 },
    { id: "card_25", formula: "y = 3x + 9", a: 3, b: 9, x_int: -3 },
    { id: "card_26", formula: "y = -3x + 6", a: -3, b: 6, x_int: 2 },
    { id: "card_27", formula: "y = 1.25x - 5", a: 1.25, b: -5, x_int: 4 },
    { id: "card_28", formula: "y = -1.25x + 5", a: -1.25, b: 5, x_int: 4 },
    { id: "card_29", formula: "y = 0.2x - 2", a: 0.2, b: -2, x_int: 10 },
    { id: "card_30", formula: "y = -0.2x + 1", a: -0.2, b: 1, x_int: 5 },
    { id: "card_31", formula: "y = x + 4", a: 1, b: 4, x_int: -4 },
    { id: "card_32", formula: "y = -x - 6", a: -1, b: -6, x_int: -6 }
];

/**
 * 주어진 일차함수를 기반으로 SVG 그래프 요소를 동적 생성하는 렌더러 클래스
 */
class NeonGraphRenderer {
    /**
     * @param {string} containerId - SVG가 들어갈 DOM 컨테이너의 ID
     */
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = 300;
        this.height = 300;
        this.padding = 20;
        this.minVal = -10;
        this.maxVal = 10;
    }

    /**
     * 값의 범위(-10 ~ 10)를 SVG 픽셀 좌표로 변환
     */
    mapX(val) {
        const plotWidth = this.width - 2 * this.padding;
        return this.padding + ((val - this.minVal) / (this.maxVal - this.minVal)) * plotWidth;
    }

    mapY(val) {
        const plotHeight = this.height - 2 * this.padding;
        // SVG Y좌표는 위가 0이므로, 수학 좌표계와 반대로 렌더링
        return this.padding + plotHeight - ((val - this.minVal) / (this.maxVal - this.minVal)) * plotHeight;
    }

    /**
     * 일차함수 그래프를 드로잉하고 컨테이너에 삽입
     * @param {Object} card - 카드 객체 (a: 기울기, b: y절편, x_int: x절편)
     * @param {boolean} showHints - 힌트 도트(절편 위치 점) 노출 여부
     */
    draw(card, showHints = false) {
        if (!this.container) return;

        const { a, b, x_int } = card;

        // SVG 뼈대 구성
        let svg = `<svg width="100%" height="100%" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg" style="background-color: #0e0f16; border-radius: 8px;">`;

        // 1. 그리드 격자 (Grid Lines)
        svg += `<g stroke="#1d2030" stroke-width="1">`;
        for (let i = this.minVal; i <= this.maxVal; i++) {
            if (i === 0) continue; // 축은 따로 그림
            const gx = this.mapX(i);
            const gy = this.mapY(i);
            // 세로선
            svg += `<line x1="${gx}" y1="${this.padding}" x2="${gx}" y2="${this.height - this.padding}" stroke-dasharray="1,4" />`;
            // 가로선
            svg += `<line x1="${this.padding}" y1="${gy}" x2="${this.width - this.padding}" y2="${gy}" stroke-dasharray="1,4" />`;
        }
        svg += `</g>`;

        // 2. 메인 X축, Y축
        const axisX = this.mapX(0);
        const axisY = this.mapY(0);
        svg += `<g stroke="#3f4566" stroke-width="2">`;
        // X축
        svg += `<line x1="${this.padding}" y1="${axisY}" x2="${this.width - this.padding}" y2="${axisY}" />`;
        // Y축
        svg += `<line x1="${axisX}" y1="${this.padding}" x2="${axisX}" y2="${this.height - this.padding}" />`;
        svg += `</g>`;

        // 축 텍스트 (화살표 또는 최소/최대 표시)
        svg += `<text x="${this.width - this.padding - 5}" y="${axisY - 5}" fill="#5d6699" font-size="10" font-family="Inter, sans-serif">x</text>`;
        svg += `<text x="${axisX + 5}" y="${this.padding + 10}" fill="#5d6699" font-size="10" font-family="Inter, sans-serif">y</text>`;

        // 3. 일차함수 그래프 선 그리기
        // y = ax + b의 양 끝점 계산 (-10, y1) -> (10, y2)
        const y1 = a * this.minVal + b;
        const y2 = a * this.maxVal + b;

        const x1_pixel = this.mapX(this.minVal);
        const y1_pixel = this.mapY(y1);
        const x2_pixel = this.mapX(this.maxVal);
        const y2_pixel = this.mapY(y2);

        // 네온 필터/글로우 효과 정의
        svg += `<defs>
            <filter id="neon-glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <filter id="neon-glow-pink" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>`;

        // 그래프 선
        svg += `<g filter="url(#neon-glow-cyan)">`;
        svg += `<line x1="${x1_pixel}" y1="${y1_pixel}" x2="${x2_pixel}" y2="${y2_pixel}" stroke="#00f0ff" stroke-width="4" stroke-linecap="round" />`;
        svg += `</g>`;

        // 4. 힌트 활성화 시 절편 포인트(점) 표시
        if (showHints) {
            // Y절편 (0, b)
            const y_int_px = this.mapX(0);
            const y_int_py = this.mapY(b);

            // X절편 (x_int, 0)
            const x_int_px = this.mapX(x_int);
            const x_int_py = this.mapY(0);

            // Y절편 도트
            if (b >= this.minVal && b <= this.maxVal) {
                svg += `<g filter="url(#neon-glow-pink)">
                    <circle cx="${y_int_px}" cy="${y_int_py}" r="6" fill="#ff007f" />
                    <text x="${y_int_px + 8}" y="${y_int_py + 4}" fill="#ff007f" font-size="11" font-weight="bold" font-family="'Orbitron', sans-serif">b=${b}</text>
                </g>`;
            }

            // X절편 도트
            if (x_int >= this.minVal && x_int <= this.maxVal) {
                svg += `<g filter="url(#neon-glow-pink)">
                    <circle cx="${x_int_px}" cy="${x_int_py}" r="6" fill="#ff007f" />
                    <text x="${x_int_px - 15}" y="${x_int_py - 8}" fill="#ff007f" font-size="11" font-weight="bold" font-family="'Orbitron', sans-serif">x=${x_int}</text>
                </g>`;
            }
        }

        svg += `</svg>`;
        this.container.innerHTML = svg;
    }
}

function generateDynamicDeck(playerCount) {
    const requiredCardsCount = (playerCount + 1) * 9;
    const usedFormulas = new Set();
    const deck = [];

    let iterations = 0;
    while (deck.length < requiredCardsCount && iterations < 20000) {
        iterations++;
        // 50% 확률로 표준형(y=ax+b) 또는 일반형(ax+by+c=0) 선택
        const isStandard = Math.random() < 0.5;

        if (isStandard) {
            // a, b는 [-10, 10] 범위의 임의 정수
            const a = Math.floor(Math.random() * 21) - 10;
            const b = Math.floor(Math.random() * 21) - 10;

            if (a === 0) continue; // 일차함수

            const x_int = -b / a;
            
            // y = ax + b 문자열 포맷
            let aStr = "";
            if (a === 1) aStr = "x";
            else if (a === -1) aStr = "-x";
            else aStr = `${a}x`;

            let bStr = "";
            if (b > 0) bStr = ` + ${b}`;
            else if (b < 0) bStr = ` - ${Math.abs(b)}`;

            const formula = `y = ${aStr}${bStr}`;

            if (!usedFormulas.has(formula)) {
                usedFormulas.add(formula);
                deck.push({
                    id: `card_${deck.length + 1}`,
                    formula: formula,
                    a: a,
                    b: b,
                    x_int: Number(x_int.toFixed(2))
                });
            }
        } else {
            // ax + by + c = 0
            const a = Math.floor(Math.random() * 21) - 10;
            const b = Math.floor(Math.random() * 21) - 10;
            const c = Math.floor(Math.random() * 21) - 10;

            if (a === 0 || b === 0) continue; // 일차함수

            // 2개 이상 정수 조건 검사 (기울기: -a/b, y절편: -c/b, x절편: -c/a)
            let integerPropsCount = 0;
            if (a % b === 0) integerPropsCount++;
            if (c % b === 0) integerPropsCount++;
            if (c % a === 0) integerPropsCount++;

            if (integerPropsCount < 2) continue;

            const slope = -a / b;
            const y_int = -c / b;
            const x_int = -c / a;

            // ax + by + c = 0 문자열 포맷
            let aStr = "";
            if (a === 1) aStr = "x";
            else if (a === -1) aStr = "-x";
            else aStr = `${a}x`;

            let bStr = "";
            if (b === 1) bStr = " + y";
            else if (b === -1) bStr = " - y";
            else if (b > 0) bStr = ` + ${b}y`;
            else if (b < 0) bStr = ` - ${Math.abs(b)}y`;

            let cStr = "";
            if (c > 0) cStr = ` + ${c}`;
            else if (c < 0) cStr = ` - ${Math.abs(c)}`;

            const formula = `${aStr}${bStr}${cStr} = 0`;

            if (!usedFormulas.has(formula)) {
                usedFormulas.add(formula);
                deck.push({
                    id: `card_${deck.length + 1}`,
                    formula: formula,
                    a: Number(slope.toFixed(2)),
                    b: Number(y_int.toFixed(2)),
                    x_int: Number(x_int.toFixed(2))
                });
            }
        }
    }

    if (deck.length < requiredCardsCount) {
        console.warn("충분한 동적 카드를 생성하지 못해 기본 카드로 백업합니다.");
        const baseDeck = [...INITIAL_CARD_DECK];
        while (deck.length < requiredCardsCount) {
            const fallbackCard = baseDeck[deck.length % baseDeck.length];
            deck.push({
                ...fallbackCard,
                id: `card_fallback_${deck.length + 1}`
            });
        }
    }

    return deck;
}

// 브라우저 및 Node(테스트 환경)에서 모두 참조할 수 있게 export 처리
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { INITIAL_CARD_DECK, NeonGraphRenderer, generateDynamicDeck };
} else {
    window.INITIAL_CARD_DECK = INITIAL_CARD_DECK;
    window.NeonGraphRenderer = NeonGraphRenderer;
    window.generateDynamicDeck = generateDynamicDeck;
}
