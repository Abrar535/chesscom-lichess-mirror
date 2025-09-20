console.log("[ChessMirror] Lichess content script loaded");

let boardReady = false;
let preferredOrientation = null; // 'white' | 'black'; initialized from current board

function simulateMoveOnBoard(uci) {
    const board = document.querySelector("cg-board");
    if (!board) return console.warn("[ChessMirror] No Lichess board found");

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);

    const squareSize = board.offsetWidth / 8;
    const fileToX = { a:0,b:1,c:2,d:3,e:4,f:5,g:6,h:7 };
    const rankToY = { '1':7,'2':6,'3':5,'4':4,'5':3,'6':2,'7':1,'8':0 };

    const x1 = fileToX[from[0]] * squareSize + squareSize/2;
    const y1 = rankToY[from[1]] * squareSize + squareSize/2;
    const x2 = fileToX[to[0]] * squareSize + squareSize/2;
    const y2 = rankToY[to[1]] * squareSize + squareSize/2;

    const eventOpts = (x, y) => ({ bubbles: true, clientX: x, clientY: y });

    // Simulate drag-and-drop
    const mousedown = new MouseEvent("mousedown", eventOpts(x1, y1));
    const mousemove = new MouseEvent("mousemove", eventOpts(x2, y2));
    const mouseup = new MouseEvent("mouseup", eventOpts(x2, y2));

    board.dispatchEvent(mousedown);
    board.dispatchEvent(mousemove);
    board.dispatchEvent(mouseup);
    ensureOrientation();
}

// Listen for messages from background/chess.com
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MOVE") {
        console.log("[ChessMirror] Move received for Lichess:", msg.uci);
        simulateMoveOnBoard(msg.uci);
    } else if (msg.type === "FEN") {
        console.log("[ChessMirror] FEN received for Lichess:", msg.fen);
        setFenOnLichess(msg.fen);
    }
});

// Set FEN on Lichess analysis board
function setFenOnLichess(fen) {
    // Find the pair where label text is "FEN" and get its input.copyable
    let fenInput = null;
    const pairs = document.querySelectorAll('.pair');
    pairs.forEach(pair => {
        const label = pair.querySelector('.name');
        const input = pair.querySelector('input.copyable');
        if (!fenInput && label && input && label.textContent.trim().toUpperCase() === 'FEN') {
            fenInput = input;
        }
    });

    if (!fenInput) {
        // Fallbacks
        fenInput = document.querySelector('input.copyable');
    }

    if (!fenInput) {
        console.warn("[ChessMirror] Could not find FEN input field on Lichess");
        return;
    }

    // Clear any existing value first
    fenInput.value = '';
    fenInput.focus();
    
    // Small delay to ensure input is ready
    setTimeout(() => {
        fenInput.value = fen;
        fenInput.dispatchEvent(new Event('input', { bubbles: true }));
        fenInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Press Enter to apply
        setTimeout(() => {
            fenInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            fenInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            
            console.log("[ChessMirror] FEN set on Lichess:", fen);
            ensureOrientation();
        }, 50);
    }, 10);
}

// Force a fixed orientation by clicking the flip button if needed
function ensureOrientation(desired) {
    const wrap = document.querySelector('.cg-wrap, .cg-container');
    if (!wrap) return;
    const isBlack = wrap.classList.contains('orientation-black');
    const current = isBlack ? 'black' : 'white';
    // Initialize preferredOrientation from current if not set
    if (!preferredOrientation) preferredOrientation = desired || current;
    const target = desired || preferredOrientation;
    if (current === target) return;
    const flipBtn = document.querySelector('button[title*="Flip" i], button[aria-label*="Flip" i], .flip.board button, .analyse__tools button.flip');
    if (flipBtn) flipBtn.click();
}

// Wait until board is loaded
function waitForBoard() {
    const board = document.querySelector("cg-board");
    if (board) {
        console.log("v1.0 [ChessMirror] Lichess board ready");
        boardReady = true;
        // Initialize orientation preference to whatever the user currently sees
        preferredOrientation = null; // will be set by ensureOrientation()
        ensureOrientation();
        // If user manually flips later, treat that as new preference
        const wrap = document.querySelector('.cg-wrap, .cg-container');
        if (wrap) {
            const obs = new MutationObserver(() => {
                const isBlack = wrap.classList.contains('orientation-black');
                preferredOrientation = isBlack ? 'black' : 'white';
            });
            obs.observe(wrap, { attributes: true, attributeFilter: ['class'] });
        }
    } else {
        setTimeout(waitForBoard, 500);
    }
}

waitForBoard();
