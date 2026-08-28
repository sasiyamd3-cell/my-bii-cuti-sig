const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ===== STATE =====
let state = {
    balance: 11.00,
    voltBalance: 20.00,
    voltPrice: 0.55,
    totalProfit: 0,
    mpps: 48,
    mppsStable: true,
    isRunning: false,
    isVerified: false,
    isCameraVerified: false,
    lossTriggered: false,
    profitCount: 0,
    peakBalance: 11.00,
    trades: [],
    password: '1234',
    sessionId: null
};

// ===== MPPS SIMULATION =====
setInterval(() => {
    if (state.mppsStable && Math.random() < 0.08) {
        state.mpps = 12;
        state.mppsStable = false;
        io.emit('mpps_drop', { mpps: 12, loss: (Math.random() * 30 + 10).toFixed(2) });
    }
    
    if (!state.mppsStable && Math.random() < 0.04) {
        state.mpps = 48;
        state.mppsStable = true;
        io.emit('mpps_recover', { mpps: 48 });
    }
}, 5000);

// ===== TRADING ENGINE =====
setInterval(() => {
    if (!state.isRunning || !state.isVerified || !state.isCameraVerified) return;
    
    const totalValue = state.voltBalance * state.voltPrice;
    
    // === LOSS MODE (MPPS 12) ===
    if (state.mpps === 12) {
        const loss = (Math.random() * 2 + 0.5) * -1;
        state.balance += loss;
        state.totalProfit += loss;
        state.voltPrice = Math.max(0.30, state.voltPrice - (Math.random() * 0.03));
        state.voltPrice = Math.round(state.voltPrice * 1000) / 1000;
        
        const trade = {
            pair: 'VOLT/USDT',
            side: 'SELL',
            amount: (Math.random() * 0.5 + 0.1).toFixed(2) + ' VOLT',
            profit: loss,
            time: 'just now',
            type: 'loss'
        };
        state.trades.unshift(trade);
        if (state.trades.length > 10) state.trades.pop();
        
        io.emit('trade_update', { trade, balance: state.balance, voltPrice: state.voltPrice });
        return;
    }
    
    // === PROFIT MODE (MPPS 48) ===
    if (totalValue < 500) {
        // SLOW PROFIT — චුට්ට චුට්ට
        const profit = (Math.random() * 0.15 + 0.02);
        state.balance += profit;
        state.totalProfit += profit;
        state.voltPrice = Math.min(2.50, state.voltPrice + (Math.random() * 0.008));
        state.voltPrice = Math.round(state.voltPrice * 1000) / 1000;
        state.profitCount++;
        
        const trade = {
            pair: 'VOLT/BTC',
            side: 'BUY',
            amount: (Math.random() * 0.1 + 0.02).toFixed(2) + ' VOLT',
            profit: profit,
            time: 'just now',
            type: 'profit'
        };
        state.trades.unshift(trade);
        if (state.trades.length > 10) state.trades.pop();
        
        io.emit('trade_update', { trade, balance: state.balance, voltPrice: state.voltPrice });
    }
    
    // === TARGET REACHED ===
    if (totalValue >= 500 && state.lossTriggered === false) {
        state.lossTriggered = true;
        io.emit('target_reached', { balance: state.balance });
    }
    
}, 3500);

// ===== SOCKET EVENTS =====
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    state.sessionId = socket.id;
    
    // Send initial state
    socket.emit('init', state);
    
    // Password verification
    socket.on('verify_password', (data) => {
        if (data.password === state.password) {
            state.isVerified = true;
            io.emit('password_verified', { success: true });
        } else {
            io.emit('password_verified', { success: false });
        }
    });
    
    // Camera verification (face scan)
    socket.on('camera_verify', (data) => {
        // Simulate face scan
        setTimeout(() => {
            state.isCameraVerified = true;
            io.emit('camera_verified', { success: true });
        }, 3000);
    });
    
    // Start trading
    socket.on('start_trading', () => {
        if (state.isVerified && state.isCameraVerified) {
            state.isRunning = true;
            io.emit('status_update', { status: 'trading', message: 'Trading started!' });
        }
    });
    
    // Stop trading
    socket.on('stop_trading', () => {
        state.isRunning = false;
        io.emit('status_update', { status: 'stopped', message: 'Trading stopped' });
    });
    
    // Withdraw
    socket.on('withdraw', (data) => {
        const total = state.balance;
        if (total >= 500 && state.isVerified && state.isCameraVerified) {
            io.emit('withdraw_success', { amount: total });
            // Reset
            state.balance = 11.00;
            state.voltBalance = 20.00;
            state.voltPrice = 0.55;
            state.totalProfit = 0;
            state.lossTriggered = false;
            state.profitCount = 0;
            state.peakBalance = 11.00;
            state.isRunning = false;
            io.emit('reset', state);
        } else {
            io.emit('withdraw_fail', { message: 'Minimum $500 required or not verified' });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
