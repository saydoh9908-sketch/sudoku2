const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { WebSocketServer } = require('ws'); // Import WebSocketServer

// Use the port provided by the environment (e.g., Render) or a default for local development.
const port = process.env.PORT || 8080;

/**
 * -------------------
 * 1. HTTP File Server
 * ------------------
 */
const httpServer = http.createServer((req, res) => {
    // Parse the request URL to separate the pathname from query parameters
    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname;

    // If the path is just "/", serve index.html. Otherwise, use the pathname.
    let filePath = pathname === '/' ? '/index.html' : pathname;

    // Construct the full path to the requested file
    const fullPath = path.join(__dirname, filePath);

    // Determine the content type based on the file extension
    const extname = String(path.extname(fullPath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // File not found
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                // Other server error
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            // File found, serve it
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

/**
 * ----------------------
 * 2. WebSocket Game Server
 * ----------------------
 */
// Attach the WebSocket server to the existing HTTP server.
const wss = new WebSocketServer({ server: httpServer });

const games = {}; // Store active games

// --- Puzzle Generation Logic (moved from client-side to server-side) ---
const N = 9;
const DIFFICULTY_LEVELS = {
    trivial: 1, beginner: 35, medium: 45, hard: 52,
    expert: 57, master: 61, legendary: 63, insane: 64
};

function isSafe(board, row, col, num) {
    for (let x = 0; x < N; x++) if (board[row][x] === num) return false;
    for (let x = 0; x < N; x++) if (board[x][col] === num) return false;
    const startRow = row - row % 3, startCol = col - col % 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[i + startRow][j + startCol] === num) return false;
    return true;
}

function solveSudoku(board) {
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            if (board[i][j] === 0) {
                const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
                for (let num of numbers) {
                    if (isSafe(board, i, j, num)) {
                        board[i][j] = num;
                        if (solveSudoku(board)) return true;
                        board[i][j] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

function countSolutions(board) {
    let count = 0;
    function solve() {
        if (count > 1) return;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            if (board[i][j] === 0) {
                for (let num = 1; num <= 9; num++) {
                    if (isSafe(board, i, j, num)) {
                        board[i][j] = num;
                        solve();
                        board[i][j] = 0;
                    }
                }
                return;
            }
        }
        count++;
    }
    solve();
    return count;
}

function generatePuzzle(difficulty) {
    const cellsToRemove = DIFFICULTY_LEVELS[difficulty] || 45;
    let board = Array(N).fill(0).map(() => Array(N).fill(0));
    solveSudoku(board);
    const solution = JSON.parse(JSON.stringify(board));

    let positions = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) positions.push([i, j]);
    positions.sort(() => Math.random() - 0.5);

    let puzzle = JSON.parse(JSON.stringify(solution));
    let removedCount = 0;
    for (const [row, col] of positions) {
        if (removedCount >= cellsToRemove) break;
        const temp = puzzle[row][col];
        puzzle[row][col] = 0;
        const tempBoard = JSON.parse(JSON.stringify(puzzle));
        if (countSolutions(tempBoard) !== 1) {
            puzzle[row][col] = temp;
        } else {
            removedCount++;
        }
    }
    return { puzzle, solution };
}
// --- End of Puzzle Generation Logic ---

wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentGameId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        currentGameId = data.gameId;

        switch (data.type) {
            case 'join':
                if (!games[data.gameId]) {
                    // First player creates the game
                    games[data.gameId] = { players: [ws], difficulty: data.difficulty, winner: null };
                    games[data.gameId].startTime = Date.now(); // Set start time when game is created
                    ws.send(JSON.stringify({ type: 'waiting' }));
                } else if (games[data.gameId].players.length === 1) {
                    // Second player joins
                    games[data.gameId].players.push(ws);
                    // Use the difficulty set by the first player
                    const difficulty = games[data.gameId].difficulty;
                    const { puzzle, solution } = generatePuzzle(difficulty);
                    
                    // Send start message to both players
                    games[data.gameId].players.forEach(player => {
                        player.send(JSON.stringify({ type: 'start', puzzle, solution }));
                    });
                } else {
                    // Game is full
                    ws.send(JSON.stringify({ type: 'error', message: 'Game is full.' }));
                }
                break;

            case 'progress':
                if (games[data.gameId]) {
                    const otherPlayer = games[data.gameId].players.find(p => p !== ws);
                    if (otherPlayer) {
                        // Re-package the message for the opponent
                        otherPlayer.send(JSON.stringify({
                            type: 'opponentProgress',
                            progress: data.progress
                        }));
                    }
                }
                break;

            case 'win':
                // Check if a winner has already been declared to prevent race conditions
                if (games[data.gameId] && !games[data.gameId].winner) {
                    games[data.gameId].winner = ws; // Declare the winner

                    // Confirm the win back to the sender
                    ws.send(JSON.stringify({ type: 'win' }));
                    const otherPlayer = games[data.gameId].players.find(p => p !== ws);
                    if (otherPlayer) {
                        // Notify the other player that they have lost
                        otherPlayer.send(JSON.stringify({ type: 'lose', time: data.time }));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // Notify the other player if they are in a game
        if (currentGameId && games[currentGameId]) {
            games[currentGameId].players = games[currentGameId].players.filter(p => p !== ws);
            if (games[currentGameId].players.length > 0) {
                games[currentGameId].players[0].send(JSON.stringify({ type: 'opponentLeft' }));
            }
            // Clean up empty game
            if (games[currentGameId].players.length === 0) {
                delete games[currentGameId];
            }
        }
    });
});

httpServer.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`WebSocket server is sharing the same port.`);
});

console.log(`WebSocket server is ready.`);
