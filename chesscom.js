console.log("[ChessMirror] chesscom.js loaded");

let prevFen = null; // kept for logs; will be derived from state below
let prevBoard = null; // piece placement only (first FEN field)
let currentTurn = 'w';
const chess = new Chess(); // from chess.js

// Map chess.com piece classes to FEN letters
const pieceMap = {
    wp: 'P', wr: 'R', wn: 'N', wb: 'B', wq: 'Q', wk: 'K',
    bp: 'p', br: 'r', bn: 'n', bb: 'b', bq: 'q', bk: 'k'
};

// Try to detect whose turn it is on chess.com (returns 'w' or 'b')
function getTurn() {
    try {
        // Common indicators across chess.com pages
        // 1) A container with attribute indicating player to move
        const attrEl = document.querySelector('[data-player-to-move]');
        const attrVal = attrEl?.getAttribute?.('data-player-to-move');
        if (attrVal === 'white') return 'w';
        if (attrVal === 'black') return 'b';

        // 2) Text-based indicators near the board or clocks
        const candidates = [
            document.querySelector('.move-turn, .clock-player-turn, .move__player, .board-player-turn'),
            document.querySelector('wc-chess-board'),
            document.querySelector('#board, .board, .game-board')
        ].filter(Boolean);

        let haystack = '';
        for (const el of candidates) {
            const aria = el.getAttribute?.('aria-label') || '';
            haystack += ' ' + aria + ' ' + (el.textContent || '');
        }
        haystack = haystack.toLowerCase();
        if (/(black to move|black-to-move|\bblack\b.*to move)/.test(haystack)) return 'b';
        if (/(white to move|white-to-move|\bwhite\b.*to move)/.test(haystack)) return 'w';
    } catch (_) {}

    // Fallback: infer from move count parity using our prevFen if available
    try {
        if (prevFen) {
            const prev = prevFen.split(' ');
            if (prev.length >= 2) {
                // Toggle the turn from previous FEN
                return prev[1] === 'w' ? 'b' : 'w';
            }
        }
    } catch (_) {}
    // Default to white
    return 'w';
}

// Read piece placement (first FEN field) from the board
function getBoardPlacement() {
    const pieces = {};
    document.querySelectorAll("wc-chess-board .piece").forEach(el => {
        const cls = el.className;
        const match = cls.match(/square-(\d+)/);
        if (!match) return;
        const sq = parseInt(match[1], 10); // e.g., 11, 12, ... 88

        // Chess.com coordinate system analysis:
        // square-xy where x=file(1-8), y=rank(1-8)
        // But the issue is that Chess.com might use a flipped coordinate system
        
        // Chess.com labels are square-xy where x is FILE (a..h = 1..8), y is RANK (1..8)
        // We want 0-based file (a=0..h=7) and 0-based rank (rank1=0..rank8=7)
        const x = Math.floor(sq / 10) - 1; // file index
        const y = (sq % 10) - 1;           // rank index

        const file = x;
        const rank = y;

        let pieceLetter;
        if (cls.includes("wp")) pieceLetter = "P";
        else if (cls.includes("wr")) pieceLetter = "R";
        else if (cls.includes("wn")) pieceLetter = "N";
        else if (cls.includes("wb")) pieceLetter = "B";
        else if (cls.includes("wq")) pieceLetter = "Q";
        else if (cls.includes("wk")) pieceLetter = "K";
        else if (cls.includes("bp")) pieceLetter = "p";
        else if (cls.includes("br")) pieceLetter = "r";
        else if (cls.includes("bn")) pieceLetter = "n";
        else if (cls.includes("bb")) pieceLetter = "b";
        else if (cls.includes("bq")) pieceLetter = "q";
        else if (cls.includes("bk")) pieceLetter = "k";

        // Store pieces by rank/file
        if (!pieces[rank]) pieces[rank] = [];
        pieces[rank][file] = pieceLetter;
    });

    // Build board from rank 8 to 1 (top to bottom in FEN)
    // FEN ranks go from 8 (top) to 1 (bottom)
    const fenRanks = [];
    for (let r = 7; r >= 0; r--) { // r=7 is rank 8, r=0 is rank 1
        let str = "", empty = 0;
        for (let f = 0; f < 8; f++) { // f=0 is file a, f=7 is file h
            const p = pieces[r]?.[f] || null;
            if (!p) empty++;
            else {
                if (empty > 0) { str += empty; empty = 0; }
                str += p;
            }
        }
        if (empty > 0) str += empty;
        fenRanks.push(str);
    }

    const turn = getTurn();
    return fenRanks.join("/");
}

// Compose full FEN from board placement and current turn
function makeFen(boardPlacement, turn) {
    return boardPlacement + " " + turn + " KQkq - 0 1";
}

// Identity conversion: once mapping is corrected, no post-processing needed
function convertToStandardFEN(chesscomFen) { return chesscomFen; }

// Detect moves
function detectMove() {
    const board = convertToStandardFEN(getBoardPlacement()).split(' ')[0];
    if (prevBoard === null) prevBoard = board;
    const fen = makeFen(board, currentTurn);
    console.log("[ChessMirror] FEN:", fen);

    if (board !== prevBoard) {
        try {
            // Load previous position with side-to-move = currentTurn
            chess.load(makeFen(prevBoard, currentTurn));
            const moves = chess.moves({ verbose: true });
            for (const move of moves) {
                const tmp = new Chess(makeFen(prevBoard, currentTurn));
                tmp.move(move);
                if (tmp.fen().split(" ")[0] === board) {
                    console.log("[ChessMirror] Detected move:", move.from + move.to + (move.promotion || ""));
                    chrome.runtime.sendMessage({ type: "MOVE", uci: move.from + move.to + (move.promotion || "") });
                    // Toggle side to move after a confirmed move
                    currentTurn = currentTurn === 'w' ? 'b' : 'w';
                    // Update prev state to the new board
                    prevBoard = board;
                    break;
                }
            }
        } catch (e) {
            console.error("[ChessMirror] Move detection failed", e);
        }
        // Send FEN reflecting the next side to move
        chrome.runtime.sendMessage({ type: "FEN", fen: makeFen(prevBoard, currentTurn) });
        prevFen = makeFen(prevBoard, currentTurn);
    }
}

// Wait for board to appear
function waitForBoard(callback) {
    const board = document.querySelector("wc-chess-board");
    if (board) {
        console.log("[ChessMirror] Found chess.com board:", board);
        callback(board);
    } else {
        setTimeout(() => waitForBoard(callback), 500);
    }
}

waitForBoard((board) => {
    // Initialize state once board is present
    currentTurn = getTurn();
    prevBoard = getBoardPlacement();
    prevFen = makeFen(prevBoard, currentTurn);
    // Debounce rapid mutations during drag animations
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(detectMove, 120);
    });
    observer.observe(board, { childList: true, subtree: true, attributes: true });
});
