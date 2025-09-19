// background.js
console.log("[ChessMirror] Background script loaded");

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "MOVE") {
        console.log("[ChessMirror] Relaying move:", msg.uci, "from tab", sender.tab.id);

        // Send the move to all Lichess Analysis tabs
        chrome.tabs.query({ url: "*://lichess.org/analysis*" }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("[ChessMirror] No Lichess Analysis tab found to send move");
                return;
            }

            tabs.forEach(tab => {
                console.log("[ChessMirror] Sending move to tab:", tab.id, "UCI:", msg.uci);
                chrome.tabs.sendMessage(tab.id, msg, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[ChessMirror] Error sending message to tab:", tab.id, chrome.runtime.lastError.message);
                    } else {
                        console.log("[ChessMirror] Move sent successfully to tab:", tab.id);
                    }
                });
            });
        });
    } else if (msg.type === "FEN") {
        console.log("[ChessMirror] Relaying FEN:", msg.fen, "from tab", sender.tab.id);

        // Send the FEN to all Lichess Analysis tabs
        chrome.tabs.query({ url: "*://lichess.org/analysis*" }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("[ChessMirror] No Lichess Analysis tab found to send FEN");
                return;
            }

            tabs.forEach(tab => {
                console.log("[ChessMirror] Sending FEN to tab:", tab.id, "FEN:", msg.fen);
                chrome.tabs.sendMessage(tab.id, msg, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[ChessMirror] Error sending FEN to tab:", tab.id, chrome.runtime.lastError.message);
                    } else {
                        console.log("[ChessMirror] FEN sent successfully to tab:", tab.id);
                    }
                });
            });
        });
    }
});
