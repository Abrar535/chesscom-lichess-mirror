console.log("[ChessMirror] chesscom.js loaded");

let prevFen = null; // kept for logs; will be derived from state below
let prevBoard = null; // piece placement only (first FEN field)
let currentTurn = 'w';
let lastSentBoard = null; // track last board position sent (piece placement only)
let lastTurnCheck = 0; // timestamp of last turn check to prevent rapid changes
let fullMoveNumber = 1; // Track the full move number properly
const chess = new Chess(); // from chess.js

// Map chess.com piece classes to FEN letters
const pieceMap = {
    wp: 'P', wr: 'R', wn: 'N', wb: 'B', wq: 'Q', wk: 'K',
    bp: 'p', br: 'r', bn: 'n', bb: 'b', bq: 'q', bk: 'k'
};

// Try to detect whose turn it is on chess.com (returns 'w' or 'b')
// NOTE: This is only used for initial setup, not during gameplay
function getTurn() {
    console.log("[ChessMirror] getTurn() called - prevFen:", prevFen);
    
    // For initial setup, check if we can determine from any existing FEN
    try {
        if (prevFen) {
            const parts = prevFen.split(' ');
            if (parts.length >= 2) {
                const turn = parts[1]; // Get turn directly from FEN
                console.log("[ChessMirror] getTurn() found turn from FEN:", turn);
                if (turn === 'w' || turn === 'b') {
                    return turn;
                }
            }
        }
    } catch (_) {}

    console.log("[ChessMirror] getTurn() defaulting to white");
    // Default to white for initial position
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

    // Return ONLY the board placement, no turn info
    return fenRanks.join("/");
}

// Compose full FEN from board placement and current turn
function makeFen(boardPlacement, turn) {
    return boardPlacement + " " + turn + " KQkq - 0 " + fullMoveNumber;
}

// Identity conversion: once mapping is corrected, no post-processing needed
function convertToStandardFEN(chesscomFen) { return chesscomFen; }

// Detect moves and handle turn changes
function detectMoveAndUpdateTurn(board, source = "mutation") {
    if (prevBoard === null) prevBoard = board;
    
    console.log(`[ChessMirror] detectMoveAndUpdateTurn() called from ${source} - currentTurn:`, currentTurn);
    const fen = makeFen(board, currentTurn);
    console.log("v7 [ChessMirror] FEN:", fen);

    if (board !== prevBoard) {
        console.log("[ChessMirror] Board changed - attempting move detection");
        console.log("[ChessMirror] Previous board:", prevBoard);
        console.log("[ChessMirror] Current board:", board);
        
        try {
            // Load previous position with side-to-move = currentTurn
            const prevFenForChess = makeFen(prevBoard, currentTurn);
            console.log("[ChessMirror] Loading previous position for chess.js:", prevFenForChess);
            
            chess.load(prevFenForChess);
            const moves = chess.moves({ verbose: true });
            console.log("[ChessMirror] Available moves from chess.js:", moves.length);
            
            let moveFound = false;
            for (const move of moves) {
                const tmp = new Chess(prevFenForChess);
                tmp.move(move);
                const resultBoard = tmp.fen().split(" ")[0];
                
                if (resultBoard === board) {
                    console.log("[ChessMirror] ✅ FOUND MATCHING MOVE:", move.from + move.to + (move.promotion || ""));
                    chrome.runtime.sendMessage({ type: "MOVE", uci: move.from + move.to + (move.promotion || "") });
                    
                    console.log("[ChessMirror] BEFORE toggle - currentTurn:", currentTurn, "fullMoveNumber:", fullMoveNumber);
                    
                    // Toggle side to move after a confirmed move
                    currentTurn = currentTurn === 'w' ? 'b' : 'w';
                    
                    // Increment full move number when black completes their move (white's turn again)
                    if (currentTurn === 'w') {
                        fullMoveNumber++;
                    }
                    
                    console.log("[ChessMirror] AFTER toggle - currentTurn:", currentTurn, "fullMoveNumber:", fullMoveNumber);
                    
                    // Update prev state to the new board
                    prevBoard = board;
                    moveFound = true;
                    break;
                }
            }
            
            if (!moveFound) {
                console.log("[ChessMirror] ❌ NO MATCHING MOVE FOUND!");
                console.log("[ChessMirror] This means chess.js couldn't find a legal move from previous position to current position");
                console.log("[ChessMirror] Possible causes: invalid FEN, multiple moves happened, or position is incorrect");
                // Update prevBoard anyway to avoid getting stuck
                prevBoard = board;
            }
            
        } catch (e) {
            console.error("[ChessMirror] Move detection failed - chess.js error:", e);
            console.log("[ChessMirror] This usually means the FEN is invalid or the position is illegal");
            // Update prevBoard anyway to avoid getting stuck
            prevBoard = board;
        }
        
        // Send FEN reflecting the current state
        const newFen = makeFen(board, currentTurn);
        const boardChanged = !lastSentBoard || JSON.stringify(board) !== JSON.stringify(lastSentBoard);
        
        console.log("[ChessMirror] Final FEN after move detection:", newFen);
        console.log("[ChessMirror] Board changed:", boardChanged);
        
        if (boardChanged) {
            chrome.runtime.sendMessage({ type: "FEN", fen: newFen });
            lastSentBoard = JSON.parse(JSON.stringify(board)); // deep copy
            console.log("[ChessMirror] Sent FEN to Lichess:", newFen);
        }
        prevFen = newFen;
    }
}

// Main detectMove function for mutation observer
function detectMove() {
    const board = getBoardPlacement();
    detectMoveAndUpdateTurn(board, "mutation");
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
    console.log("[ChessMirror] Initializing - currentTurn before getTurn():", currentTurn);
    
    // Initialize state once board is present
    currentTurn = getTurn(); // Only used for initial setup
    console.log("[ChessMirror] Initializing - currentTurn after getTurn():", currentTurn);
    
    prevBoard = getBoardPlacement();
    prevFen = makeFen(prevBoard, currentTurn);
    lastSentBoard = JSON.parse(JSON.stringify(prevBoard)); // Initialize last sent board position
    
    console.log("[ChessMirror] Initial state - currentTurn:", currentTurn, "fullMoveNumber:", fullMoveNumber);
    
    // Send initial FEN to Lichess
    chrome.runtime.sendMessage({ type: "FEN", fen: prevFen });
    console.log("[ChessMirror] Initial FEN sent to Lichess:", prevFen);
    
    // Debounce rapid mutations during drag animations
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(detectMove, 50); // Reduced from 120ms to 50ms for faster response
    });
    observer.observe(board, { childList: true, subtree: true, attributes: true });
    
    // Periodic check for fast play scenarios - now uses proper move detection
    setInterval(() => {
        const currentBoard = getBoardPlacement();
        
        // Only run detection if board actually changed
        if (JSON.stringify(currentBoard) !== JSON.stringify(prevBoard)) {
            console.log("v7[ChessMirror] Periodic check detected board change - running move detection");
            detectMoveAndUpdateTurn(currentBoard, "periodic");
        }
    }, 200); // Check every 200ms
});