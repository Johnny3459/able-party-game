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
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();

const QUIZ_BANK = {
  NONSENSE: [
    { q: '왕이 넘어지면 무엇이 될까?', a: ['킹콩'] },
    { q: '세상에서 가장 지루한 중학교는?', a: ['로딩중'] },
    { q: '아몬드가 죽으면 무엇이 될까?', a: ['다이아몬드'] },
    { q: '소나무가 삐지면 무엇이 될까?', a: ['칫솔'] },
    { q: '오리가 얼면 무엇이 될까?', a: ['언덕'] },
    { q: '세상에서 가장 뜨거운 과일은?', a: ['천도복숭아'] },
    { q: '신발이 화가 나면 무엇이 될까?', a: ['신발끈'] },
    { q: '가장 야한 채소는?', a: ['버섯'] }
  ],
  CHOSUNG: [
    { q: 'ㅅㄴㅎ (연말 행사)', a: ['송년회'] },
    { q: 'ㅌㅂㄷ (협동 게임)', a: ['팀빌딩'] },
    { q: 'ㅎㅇㄱ (추첨 상품)', a: ['행운권'] },
    { q: 'ㄷㅎㅁㄱ (우리나라)', a: ['대한민국'] },
    { q: 'ㅂㄱㅍㄹㅈㅌ (행사 장비)', a: ['빔프로젝터'] }
  ],
  IDIOM: [
    { q: '일석이__', a: ['조'] },
    { q: '고진감__', a: ['래'] },
    { q: '동문서__', a: ['답'] },
    { q: '유비무__', a: ['환'] },
    { q: '역지사__', a: ['지'] },
    { q: '금상첨__', a: ['화'] }
  ],
  CAPITAL: [
    { q: '호주의 수도는?', a: ['캔버라'] },
    { q: '스위스의 수도는?', a: ['베른'] },
    { q: '캐나다의 수도는?', a: ['오타와'] },
    { q: '튀르키예의 수도는?', a: ['앙카라'] },
    { q: '브라질의 수도는?', a: ['브라질리아'] }
  ],
  SONG: [
    { q: '가사: "사랑을 했다 우리가 만나 지우지 못할 추억이 됐다"', a: ['사랑을했다'] },
    { q: '가사: "아모르 파티~ 인생은 지금이야"', a: ['아모르파티'] },
    { q: '가사: "아파트 아파트~ 아파트 아파트~"', a: ['아파트', 'apt'] },
    { q: '가사: "밤양갱~ 달디달고 달디달고 달디단 밤양갱"', a: ['밤양갱'] }
  ],
  TWENTY: [
    { hints: ['힌트1: 먹는 것입니다', '힌트2: 빨간색이 대표적입니다', '힌트3: 스마트폰 브랜드 로고이기도 합니다'], a: ['사과'] },
    { hints: ['힌트1: 직장에서 자주 씁니다', '힌트2: 종이를 묶을 때 씁니다', '힌트3: 철심이 들어갑니다'], a: ['스테이플러', '호치키스'] },
    { hints: ['힌트1: 동물의 왕으로 불립니다', '힌트2: 갈기가 멋집니다', '힌트3: 아프리카 초원에 삽니다'], a: ['사자'] }
  ],
  DETECTIVE: [
    {
      story: '사라진 CEO의 황금 트로피! 범인은 누구? (1~4번 중 선택)',
      clues: ['1번 김대리: "전 화장실에 다녀왔어요."', '2번 박과장: "전 2층 발코니에서 바람을 쐬었습니다."', '3번 이주임: "전 1층 로비에서 택배를 받았습니다."', '4번 최부장: "전 지하 주차장에서 차를 뺐습니다."', '결정적 단서: 범행 시각 2층 발코니는 공사 중이라 출입문이 잠겨 있었다!'],
      answer: '2'
    }
  ]
};

let gameState = {
  phase: 'LOBBY',
  players: {},
  roundIdx: 0,
  solvedBy: null,
  currentData: {},
  memoryGrid: [],
  customQuizzes: [],
  currentWord: '대한민국',
  usedWords: ['대한민국'],
  mathQ: '',
  mathA: 0,
  submissions: {},
  revealResult: null,
  luckyWinner: null
};

function generateMemoryGrid() {
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const grid = Array(9).fill(0);
  for (let num = 1; num <= 5; num++) grid[indices[num - 1]] = num;
  return grid;
}

function setupPhaseData(phase, resetIdx = true) {
  gameState.phase = phase;
  gameState.solvedBy = null;
  gameState.submissions = {};
  gameState.revealResult = null;
  if (resetIdx) gameState.roundIdx = 0;

  if (phase === 'MEMORY') {
    gameState.memoryGrid = generateMemoryGrid();
  } else if (phase === 'CUSTOM_COLLECT') {
    gameState.customQuizzes = [];
  } else if (phase === 'WORDCHAIN') {
    gameState.currentWord = '대한민국';
    gameState.usedWords = ['대한민국'];
  } else if (phase === 'MATH') {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 9) + 1;
    gameState.mathQ = a + ' × ' + b;
    gameState.mathA = a * b;
  } else if (['NONSENSE', 'CHOSUNG', 'IDIOM', 'CAPITAL', 'SONG', 'TWENTY', 'DETECTIVE'].includes(phase)) {
    const list = QUIZ_BANK[phase];
    gameState.currentData = list[gameState.roundIdx % list.length];
  } else if (phase === 'REFLEX') {
    const cmds = [
      { text: '🔵 청기 올려!', target: 'BLUE_UP' },
      { text: '⚪ 백기 올려!', target: 'WHITE_UP' },
      { text: '🔵 청기 내리지 말고 백기 올려!', target: 'WHITE_UP' },
      { text: '⚪ 백기 올리지 말고 청기 올려!', target: 'BLUE_UP' }
    ];
    gameState.currentData = cmds[Math.floor(Math.random() * cmds.length)];
  } else if (phase === 'BOMB') {
    gameState.currentData = { holderName: '폭탄 대기중', passes: 0 };
  } else if (phase === 'CONDITION') {
    const conds = [
      '오늘 지갑에 현금 5만 원 이상 있는 분!',
      '이번 달이 생일이신 분!',
      '오늘 스마트폰 배터리가 80% 이상인 분!',
      '집에서 행사장까지 1시간 이상 걸려서 오신 분!'
    ];
    gameState.currentData = { text: conds[gameState.roundIdx % conds.length] };
  }
}

app.get('/qr', async (req, res) => {
  const hostHeader = req.get('host') || '';
  const playerUrl = hostHeader.includes('localhost')
    ? 'http://' + LOCAL_IP + ':' + PORT + '/player.html'
    : 'https://' + hostHeader + '/player.html';
  try {
    const qrDataUrl = await QRCode.toDataURL(playerUrl, { width: 260, margin: 2 });
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

  socket.on('player-join', ({ playerId, name, table }) => {
    if (!gameState.players[playerId]) {
      gameState.players[playerId] = { name, table: table || '자유석', score: 0 };
    } else {
      if (name) gameState.players[playerId].name = name;
      if (table) gameState.players[playerId].table = table;
    }
    socket.playerId = playerId;
    io.to('host').emit('state-update', gameState);
    socket.emit('phase-change', gameState);
  });

  socket.on('change-phase', (nextPhase) => {
    setupPhaseData(nextPhase, true);
    io.emit('phase-change', gameState);
    io.to('host').emit('state-update', gameState);
  });

  socket.on('next-question', () => {
    gameState.roundIdx += 1;
    setupPhaseData(gameState.phase, false);
    io.emit('phase-change', gameState);
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-memory', ({ playerId, clickedIndices, timeTakenMs }) => {
    if (gameState.phase !== 'MEMORY' || !gameState.players[playerId]) return;
    const correct = [1, 2, 3, 4, 5].map(n => gameState.memoryGrid.indexOf(n));
    if (JSON.stringify(clickedIndices) === JSON.stringify(correct)) {
      const earned = 500 + Math.max(0, 500 - Math.floor(timeTakenMs / 25));
      gameState.players[playerId].score += earned;
      socket.emit('action-result', '완벽합니다! +' + earned + '점!');
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', '순서나 위치가 틀렸습니다!');
    }
  });

  socket.on('submit-custom-quiz', ({ playerId, question, answer }) => {
    if (gameState.phase !== 'CUSTOM_COLLECT' || !gameState.players[playerId]) return;
    if (gameState.customQuizzes.length >= 12) return socket.emit('action-result', '선착순 12문제가 마감되었습니다!');
    if (gameState.customQuizzes.some(q => q.authorId === playerId)) return socket.emit('action-result', '이미 출제하셨습니다!');
    gameState.customQuizzes.push({ authorId: playerId, authorName: gameState.players[playerId].name, question, answer });
    gameState.players[playerId].score += 200;
    socket.emit('action-result', '출제 완료 (' + gameState.customQuizzes.length + '/12)! +200점!');
    io.to('host').emit('state-update', gameState);
  });

  socket.on('answer-custom-quiz', ({ playerId, guess }) => {
    if (gameState.phase !== 'CUSTOM_SOLVE' || !gameState.players[playerId]) return;
    const q = gameState.customQuizzes[gameState.roundIdx];
    if (!q) return;
    if (q.authorId === playerId) return socket.emit('action-result', '본인 문제는 맞힐 수 없습니다!');
    if (gameState.solvedBy) return socket.emit('action-result', '이미 ' + gameState.solvedBy + '님이 맞혔습니다!');
    if (guess.replace(/\s+/g, '').toLowerCase() === q.answer.replace(/\s+/g, '').toLowerCase()) {
      gameState.solvedBy = gameState.players[playerId].name;
      gameState.players[playerId].score += 600;
      socket.emit('action-result', '정답! +600점!');
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', '땡! 다시 시도하세요.');
    }
  });

  socket.on('submit-word', ({ playerId, word }) => {
    if (gameState.phase !== 'WORDCHAIN' || !gameState.players[playerId]) return;
    const w = word.trim();
    const last = gameState.currentWord.slice(-1);
    if (w.length < 2 || w[0] !== last || gameState.usedWords.includes(w)) {
      return socket.emit('action-result', "'" + last + "'(으)로 시작하는 새 단어를 입력하세요!");
    }
    gameState.currentWord = w;
    gameState.usedWords.push(w);
    const earned = w.length * 100;
    gameState.players[playerId].score += earned;
    socket.emit('action-result', "'" + w + "' 성공! +" + earned + "점");
    io.emit('word-updated', { currentWord: w, playerName: gameState.players[playerId].name });
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-math', ({ playerId, answer }) => {
    if (gameState.phase !== 'MATH' || !gameState.players[playerId]) return;
    if (gameState.solvedBy) return socket.emit('action-result', '이미 ' + gameState.solvedBy + '님이 맞혔습니다!');
    if (parseInt(answer, 10) === gameState.mathA) {
      gameState.solvedBy = gameState.players[playerId].name;
      gameState.players[playerId].score += 400;
      socket.emit('action-result', '스피드 정답! +400점!');
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', '오답입니다!');
    }
  });

  socket.on('submit-text-quiz', ({ playerId, guess }) => {
    if (!gameState.players[playerId]) return;
    if (gameState.solvedBy) return socket.emit('action-result', '이미 ' + gameState.solvedBy + '님이 맞혔습니다!');
    const clean = guess.replace(/\s+/g, '').toLowerCase();
    const answers = gameState.currentData.a || [gameState.currentData.answer];
    if (answers && answers.some(ans => ans.replace(/\s+/g, '').toLowerCase() === clean)) {
      gameState.solvedBy = gameState.players[playerId].name;
      gameState.players[playerId].score += 500;
      socket.emit('action-result', '정답입니다! 선착순 +500점!');
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', '오답입니다! 다시 도전하세요.');
    }
  });

  socket.on('submit-clicker', ({ playerId, clicks }) => {
    if (gameState.phase !== 'CLICKER' || !gameState.players[playerId]) return;
    gameState.submissions[playerId] = clicks;
    gameState.players[playerId].score += clicks * 10;
    socket.emit('action-result', '총 ' + clicks + '회 연타! +' + (clicks * 10) + '점 반영!');
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-stopwatch', ({ playerId, timeSec }) => {
    if (gameState.phase !== 'STOPWATCH' || !gameState.players[playerId]) return;
    const diff = Math.abs(7.77 - timeSec);
    const earned = Math.max(100, Math.round(1000 - diff * 300));
    gameState.submissions[playerId] = timeSec.toFixed(2) + '초';
    gameState.players[playerId].score += earned;
    socket.emit('action-result', '기록: ' + timeSec.toFixed(2) + '초 → +' + earned + '점!');
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-reflex', ({ playerId, action }) => {
    if (gameState.phase !== 'REFLEX' || !gameState.players[playerId]) return;
    if (gameState.solvedBy) return socket.emit('action-result', '이미 ' + gameState.solvedBy + '님이 1등했습니다!');
    if (action === gameState.currentData.target) {
      gameState.solvedBy = gameState.players[playerId].name;
      gameState.players[playerId].score += 400;
      socket.emit('action-result', '1등 반응속도! +400점!');
      io.to('host').emit('state-update', gameState);
    } else {
      socket.emit('action-result', '반대로 눌렀습니다! 실격!');
    }
  });

  socket.on('submit-num15', ({ playerId, timeSec }) => {
    if (gameState.phase !== 'NUM15' || !gameState.players[playerId]) return;
    const earned = Math.max(200, Math.round(1000 - timeSec * 40));
    gameState.players[playerId].score += earned;
    socket.emit('action-result', timeSec.toFixed(2) + '초 완주! +' + earned + '점!');
    io.to('host').emit('state-update', gameState);
  });

  socket.on('pass-bomb', ({ playerId }) => {
    if (gameState.phase !== 'BOMB' || !gameState.players[playerId]) return;
    gameState.currentData.holderName = gameState.players[playerId].name;
    gameState.currentData.passes += 1;
    gameState.players[playerId].score += 50;
    socket.emit('action-result', '폭탄 패스 성공! (+50점)');
    io.to('host').emit('state-update', gameState);
  });

  socket.on('submit-choice', ({ playerId, value }) => {
    if (!gameState.players[playerId]) return;
    gameState.submissions[playerId] = value;
    if (gameState.phase === 'CONDITION') {
      gameState.players[playerId].score += 300;
      socket.emit('action-result', '조건 인증 완료! +300점 획득!');
    } else {
      socket.emit('action-result', '[' + value + '] 선택 완료! 결과 발표를 기다리세요.');
    }
    io.to('host').emit('state-update', gameState);
  });

  socket.on('calculate-choice-result', () => {
    const entries = Object.entries(gameState.submissions);
    if (entries.length === 0) return;

    if (gameState.phase === 'NUNCHI') {
      const counts = {};
      entries.forEach(([, val]) => counts[val] = (counts[val] || 0) + 1);
      const minCount = Math.min(...Object.values(counts));
      const winningNums = Object.keys(counts).filter(k => counts[k] === minCount);
      const winners = [];
      entries.forEach(([pid, val]) => {
        if (winningNums.includes(String(val)) && gameState.players[pid]) {
          gameState.players[pid].score += 700;
          winners.push(gameState.players[pid].name);
        }
      });
      gameState.revealResult = '최소 선택 번호 [' + winningNums.join(', ') + '번] (' + minCount + '명) → ' + winners.join(', ') + '님 +700점!';
    } else if (gameState.phase === 'MINORITY') {
      const countA = entries.filter(([, v]) => v === 'A').length;
      const countB = entries.filter(([, v]) => v === 'B').length;
      const winSide = countA <= countB ? 'A' : 'B';
      entries.forEach(([pid, val]) => {
        if (val === winSide && gameState.players[pid]) gameState.players[pid].score += 500;
      });
      gameState.revealResult = 'A(' + countA + '명) vs B(' + countB + '명) → 소수파 [' + winSide + '] 승리! (+500점)';
    } else if (gameState.phase === 'LOTTO') {
      const luckyNum = Math.floor(Math.random() * 20) + 1;
      const winners = [];
      entries.forEach(([pid, val]) => {
        if (parseInt(val, 10) === luckyNum && gameState.players[pid]) {
          gameState.players[pid].score += 1500;
          winners.push(gameState.players[pid].name);
        }
      });
      gameState.revealResult = '행운의 로또 번호: [' + luckyNum + '번] 당첨자: ' + (winners.length ? winners.join(', ') + ' (+1500점!)' : '없음');
    } else if (gameState.phase === 'AVG80') {
      const nums = entries.map(([, v]) => parseFloat(v));
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      const target = avg * 0.8;
      let bestPid = null;
      let minDiff = Infinity;
      entries.forEach(([pid, v]) => {
        const diff = Math.abs(target - parseFloat(v));
        if (diff < minDiff) { minDiff = diff; bestPid = pid; }
      });
      if (bestPid && gameState.players[bestPid]) {
        gameState.players[bestPid].score += 800;
        gameState.revealResult = '전체 평균 ' + avg.toFixed(1) + '의 80% = [' + target.toFixed(1) + '] → 근접 1위 ' + gameState.players[bestPid].name + '님 (+800점!)';
      }
    } else if (gameState.phase === 'OX') {
      const countO = entries.filter(([, v]) => v === 'O').length;
      const countX = entries.filter(([, v]) => v === 'X').length;
      gameState.revealResult = '선택 현황: O (' + countO + '명) / X (' + countX + '명) - 아래 정답 버튼을 눌러 점수를 지급하세요!';
    } else if (gameState.phase === 'VOTE') {
      const tally = { '1번': 0, '2번': 0, '3번': 0, '4번': 0 };
      entries.forEach(([, v]) => { if (tally[v] !== undefined) tally[v] += 1; });
      gameState.revealResult = '투표 결과: 1번(' + tally['1번'] + '표) | 2번(' + tally['2번'] + '표) | 3번(' + tally['3번'] + '표) | 4번(' + tally['4번'] + '표)';
    }

    io.to('host').emit('state-update', gameState);
  });

  socket.on('award-ox', (correctOX) => {
    Object.entries(gameState.submissions).forEach(([pid, val]) => {
      if (val === correctOX && gameState.players[pid]) gameState.players[pid].score += 400;
    });
    gameState.revealResult = '정답은 [' + correctOX + ']! 맞힌 모든 분께 +400점 지급 완료!';
    io.to('host').emit('state-update', gameState);
  });

  socket.on('draw-lucky', () => {
    const list = Object.values(gameState.players);
    if (list.length === 0) return;
    const winner = list[Math.floor(Math.random() * list.length)];
    gameState.luckyWinner = winner.name + ' (' + winner.table + '테이블)';
    io.to('host').emit('state-update', gameState);
  });
});

server.listen(PORT, () => {
  console.log('25종 파티게임 서버 실행 완료 - 포트:', PORT);
});
