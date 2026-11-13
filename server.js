const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();

let gameState = {
  phase: 'LOBBY',
  players: {},
  memorySequence: [],
  currentWord: '사과',
  usedWords: ['사과']
};

app.get('/qr', async (req, res) => {
  const hostHeader = req.get('host'); const protocol = req.headers['x-forwarded-proto'] || 'http'; const playerUrl = `\://\/player.html`;
  try {
    const qrDataUrl = await QRCode.toDataURL(playerUrl, { width: 300, margin: 2 });
    res.json({ qrDataUrl, playerUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR 생성 실패' });
  }
});

io.on('connection', (socket) => {
  socket.on('host-join', () => {
    socket.join('host');
    socket.emit('state-update', gameState);
  });

  socket.on('player-join', ({ playerId, name }) => {
    if (!gameState.players[playerId]) {
      gameState.players[playerId] = { name, score: 0, connected: true };
    } else {
      gameState.players[playerId].name = name || gameState.players[playerId].name;
      gameState.players[playerId].connected = true;
    }
    socket.playerId = playerId;
    io.to('host').emit('state-update', gameState);
    socket.emit('phase-change', gameState);
  });

  socket.on('change-phase', (nextPhase) => {
    gameState.phase = nextPhase;
    if (nextPhase === 'MEMORY') {
      const colors = ['RED', 'BLUE', 'YELLOW', 'GREEN'];
      gameState.memorySequence = Array.from({ length: 4 }, () => colors[Math.floor(Math.random() * 4)]);
    } else if (nextPhase === 'WORDCHAIN') {
      gameState.currentWord = '대한민국';
      gameState.usedWords = ['대한민국'];
    }
    io.emit('phase-change', gameState);
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-memory', ({ playerId, sequence, timeTakenMs }) => {
    if (gameState.phase !== 'MEMORY' || !gameState.players[playerId]) return;
    const isCorrect = JSON.stringify(sequence) === JSON.stringify(gameState.memorySequence);
    if (isCorrect) {
      const speedBonus = Math.max(0, 500 - Math.floor(timeTakenMs / 20));
      const earned = 500 + speedBonus;
      gameState.players[playerId].score += earned;
      socket.emit('action-result', { success: true, message: `정답! +${earned}점 획득!` });
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', { success: false, message: '순서가 틀렸습니다!' });
    }
  });

  socket.on('submit-word', ({ playerId, word }) => {
    if (gameState.phase !== 'WORDCHAIN' || !gameState.players[playerId]) return;
    const cleanWord = word.trim();
    const lastChar = gameState.currentWord.slice(-1);

    if (cleanWord.length < 2) {
      return socket.emit('action-result', { success: false, message: '두 글자 이상 입력하세요.' });
    }
    if (cleanWord[0] !== lastChar) {
      return socket.emit('action-result', { success: false, message: `'${lastChar}'(으)로 시작해야 합니다!` });
    }
    if (gameState.usedWords.includes(cleanWord)) {
      return socket.emit('action-result', { success: false, message: '이미 나온 단어입니다!' });
    }

    gameState.currentWord = cleanWord;
    gameState.usedWords.push(cleanWord);
    const earned = cleanWord.length * 100;
    gameState.players[playerId].score += earned;

    socket.emit('action-result', { success: true, message: `'${cleanWord}' 성공! +${earned}점` });
    io.emit('word-updated', { currentWord: cleanWord, playerName: gameState.players[playerId].name });
    io.to('host').emit('state-update', gameState);
  });
});

server.listen(PORT, () => {
  console.log('===============================================');
  console.log('게임 서버가 실행되었습니다!');
  console.log(`호스트(전광판) 접속 주소: http://localhost:${PORT}/host.html`);
  console.log(`스마트폰 테스트 주소: http://${LOCAL_IP}:${PORT}/player.html`);
  console.log('===============================================');
});

