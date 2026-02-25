// --- AUDIO SYSTEM ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

const SFX = {
  mute: false,
  init: function() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  },
  playTone: function(freq, type, duration, vol=0.1) {
    if (this.mute || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  },
  coin: function() { 
    this.init();
    this.playTone(1200, 'square', 0.1, 0.1); 
    setTimeout(() => this.playTone(1600, 'square', 0.2, 0.1), 100); 
  },
  move: function() { this.playTone(100, 'sawtooth', 0.05, 0.05); },
  drop: function() {
    if (this.mute || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 1.2); 
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  },
  grab: function() { this.playTone(150, 'square', 0.1, 0.2); },
  win: function() {
    if (this.mute || !audioCtx) return;
    let now = audioCtx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      let osc = audioCtx.createOscillator();
      let gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now + i*0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i*0.1 + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i*0.1);
      osc.stop(now + i*0.1 + 0.4);
    });
  },
  lose: function() {
    this.playTone(150, 'sawtooth', 0.4, 0.2);
    setTimeout(() => this.playTone(100, 'sawtooth', 0.6, 0.2), 300);
  }
};

// --- ALPHABET DATA ---
const fullAlphabet = [];
for (let i = 0; i < 26; i++) {
  let upper = String.fromCharCode(65 + i);
  if(upper === 'I') upper = 'Ｉ'; 
  const lower = String.fromCharCode(97 + i);
  fullAlphabet.push(upper + lower);
}

// User Selection Memory
let selectedPool = []; 
let lastTimeSetting = 60; 

// --- GAME STATE ---
let gameState = {
  score: 0, timeLeft: 60, isPlaying: false,
  clawPosition: 50, 
  targetWord: "", 
  lastTargetWord: null, // [新增] 用來記錄上一題
  attemptsOnCurrentWord: 0,
  capsules: [] 
};

const CLAW_SPEED = 0.6;
const MAX_BALLS_ON_SCREEN = 5;

// DOM
const clawAssembly = document.getElementById('claw-assembly');
const clawRod = document.getElementById('claw-rod');
const playArea = document.getElementById('play-area');
const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const btnGrab = document.getElementById('btn-grab');
const btnMenu = document.getElementById('btn-menu'); 
const letterModal = document.getElementById('letter-modal');
const timerModal = document.getElementById('timer-modal');
const resultModal = document.getElementById('result-modal');
const finalScore = document.getElementById('final-score');
const muteCheck = document.getElementById('mute-toggle');
const glassWindow = document.querySelector('.glass-window');
const letterGrid = document.getElementById('letter-grid');

const synth = window.speechSynthesis;
let femaleVoice = null;

function loadVoices() {
  const voices = synth.getVoices();
  femaleVoice = voices.find(voice => 
    voice.name.includes("Zira") ||      
    voice.name.includes("Samantha") ||  
    voice.name.includes("Google US English") || 
    voice.name.includes("Female")
  );
  if (!femaleVoice) femaleVoice = voices.find(voice => voice.lang === 'en-US');
}
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

// --- 介面邏輯 ---

function renderLetterGrid() {
  letterGrid.innerHTML = "";
  fullAlphabet.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.textContent = letter;
    if (selectedPool.includes(letter)) btn.classList.add('selected');
    btn.onclick = () => toggleLetter(btn, letter);
    letterGrid.appendChild(btn);
  });
}

function toggleLetter(btn, letter) {
  SFX.init();
  if (selectedPool.includes(letter)) {
    selectedPool = selectedPool.filter(l => l !== letter);
    btn.classList.remove('selected');
  } else {
    selectedPool.push(letter);
    btn.classList.add('selected');
  }
}

function toggleSelectAll(select) {
  SFX.init();
  if (select) {
    selectedPool = [...fullAlphabet];
  } else {
    selectedPool = [];
  }
  renderLetterGrid();
}

function confirmLetters() {
  SFX.init();
  if (selectedPool.length === 0) {
    alert("Please select at least one letter!");
    return;
  }
  letterModal.style.display = 'none';
  timerModal.style.display = 'flex';
  SFX.coin();
}

function backToLetters() {
  timerModal.style.display = 'none';
  letterModal.style.display = 'flex';
}

btnMenu.addEventListener('click', showMenu);
document.getElementById('btn-listen').addEventListener('click', () => speak(gameState.targetWord));
muteCheck.addEventListener('change', (e) => SFX.mute = e.target.checked);

function showMenu() {
  gameState.isPlaying = false;
  letterModal.style.display = 'flex';
  timerModal.style.display = 'none';
  resultModal.style.display = 'none';
  renderLetterGrid();
  SFX.init();
}

function playAgain() {
  SFX.init();
  resultModal.style.display = 'none';
  startGame(lastTimeSetting); 
  SFX.coin();
}

function selectTime(seconds) {
  SFX.init(); 
  lastTimeSetting = seconds; 
  timerModal.style.display = 'none';
  startGame(seconds);
  SFX.coin(); 
}

function startGame(seconds) {
  gameState.score = 0; 
  gameState.timeLeft = seconds; 
  gameState.isPlaying = true;
  gameState.lastTargetWord = null; // 重置上一題紀錄
  scoreDisplay.innerText = "0"; 
  resultModal.style.display = 'none';
  
  nextRound();
  
  const timerInterval = setInterval(() => {
    if(!gameState.isPlaying) { clearInterval(timerInterval); return; }
    gameState.timeLeft--;
    timerDisplay.innerText = gameState.timeLeft;
    if (gameState.timeLeft <= 0) { clearInterval(timerInterval); endGame(); }
  }, 1000);
}

function nextRound() {
  playArea.innerHTML = ""; gameState.capsules = [];
  gameState.attemptsOnCurrentWord = 0;
  
  // 防呆：如果 selectedPool 是空 (異常狀況)，填滿它
  if(selectedPool.length === 0) selectedPool = [...fullAlphabet];

  // [修改點] 智慧選題邏輯
  let candidates = selectedPool;
  
  // 如果選取池大於1個，就排除上一題的字，避免連續重複
  if (selectedPool.length > 1 && gameState.lastTargetWord) {
    candidates = selectedPool.filter(w => w !== gameState.lastTargetWord);
  }
  
  // 從候選名單中隨機選
  gameState.targetWord = candidates[Math.floor(Math.random() * candidates.length)];
  
  // 記錄這一題，供下一回合排除使用
  gameState.lastTargetWord = gameState.targetWord;
  
  // 準備球池
  let roundWords = [gameState.targetWord];
  while (roundWords.length < MAX_BALLS_ON_SCREEN) {
    let w = fullAlphabet[Math.floor(Math.random() * fullAlphabet.length)];
    if (w !== gameState.targetWord && !roundWords.includes(w)) {
      roundWords.push(w);
    }
  }
  roundWords.sort(() => Math.random() - 0.5);
  
  const startX = 22; 
  const availableWidth = 95 - startX; 
  const sectionWidth = availableWidth / MAX_BALLS_ON_SCREEN;
  
  roundWords.forEach((word, i) => {
    const caps = document.createElement('div');
    caps.className = 'capsule';
    caps.innerHTML = `<div class="capsule-top"></div><div class="capsule-bottom">${word}</div>`;
    
    const baseX = startX + (i * sectionWidth);
    let leftPos = baseX + ((Math.random() * 4) - 2); 
    if (leftPos < 20) leftPos = 20;
    
    caps.style.left = `${leftPos}%`;
    caps.style.transition = 'bottom 0.5s ease-in, left 0.5s';
    caps.style.bottom = '3vh'; 
    
    const hue = Math.floor(Math.random() * 360);
    caps.querySelector('.capsule-top').style.background = `hsl(${hue}, 75%, 65%)`;
    playArea.appendChild(caps);
    gameState.capsules.push({ el: caps, word: word, x: leftPos });
  });

  btnGrab.disabled = false;
  setTimeout(() => speak(gameState.targetWord), 500);
}

// Controls
let moveRaf = null; 
['mousedown', 'touchstart'].forEach(evt => {
  document.getElementById('btn-left').addEventListener(evt, (e) => { e.preventDefault(); startMove(-1); });
  document.getElementById('btn-right').addEventListener(evt, (e) => { e.preventDefault(); startMove(1); });
});
['mouseup', 'mouseleave', 'touchend'].forEach(evt => {
  document.getElementById('btn-left').addEventListener(evt, stopMove);
  document.getElementById('btn-right').addEventListener(evt, stopMove);
});

function startMove(dir) {
  if (!gameState.isPlaying || btnGrab.disabled) return;
  if (!moveRaf) {
    const loop = () => {
      gameState.clawPosition += (dir * CLAW_SPEED);
      if (gameState.clawPosition < 6) gameState.clawPosition = 6;
      if (gameState.clawPosition > 94) gameState.clawPosition = 94;
      clawAssembly.style.left = `${gameState.clawPosition}%`;
      if(Math.random() > 0.95) SFX.move(); 
      moveRaf = requestAnimationFrame(loop);
    };
    moveRaf = requestAnimationFrame(loop);
  }
}

function stopMove() {
  if (moveRaf) {
    cancelAnimationFrame(moveRaf);
    moveRaf = null;
  }
}

btnGrab.addEventListener('click', performCatch);
btnGrab.addEventListener('touchstart', (e) => { e.preventDefault(); performCatch(); });

function performCatch() {
  if (!gameState.isPlaying || btnGrab.disabled) return;
  btnGrab.disabled = true; 
  SFX.drop();
  
  const glassHeight = glassWindow.offsetHeight;
  const clawBottomLimit = glassHeight * 0.82; 
  
  clawRod.style.transition = "height 1.2s ease-in"; 
  clawRod.style.height = `${clawBottomLimit}px`;
  
  setTimeout(() => {
    clawAssembly.classList.add('closed'); 
    SFX.grab();
    
    let caughtObj = null; let minDiff = 100;
    gameState.capsules.forEach(obj => {
      const diff = Math.abs(obj.x - gameState.clawPosition);
      if (diff < 9 && diff < minDiff) { minDiff = diff; caughtObj = obj; }
    });
    
    setTimeout(() => {
       clawRod.style.transition = "height 1.2s ease-out";
       clawRod.style.height = '0px';
       
       if (caughtObj) animateLift(caughtObj);
       else setTimeout(() => { clawAssembly.classList.remove('closed'); btnGrab.disabled = false; }, 1200);
    }, 500);
  }, 1200); 
}

function animateLift(obj) {
  gameState.attemptsOnCurrentWord++;
  const el = obj.el;
  el.style.transition = 'none';
  
  const liftLoop = () => {
    const rodHeight = clawRod.getBoundingClientRect().height;
    const clawBodyHeight = clawAssembly.querySelector('.claw-body').getBoundingClientRect().height;
    const targetTop = 10 + rodHeight + clawBodyHeight;
    
    el.style.top = `${targetTop}px`;
    el.style.bottom = 'auto'; 
    el.style.left = `${gameState.clawPosition}%`;
    
    if (rodHeight <= 5) {
      checkSuccess(obj);
    } else {
      requestAnimationFrame(liftLoop);
    }
  };
  requestAnimationFrame(liftLoop);
}

function checkSuccess(obj) {
  const isCorrect = (obj.word === gameState.targetWord);
  
  let winChance = 0;
  if (isCorrect) {
    if (gameState.attemptsOnCurrentWord === 1) winChance = 0.6;
    else if (gameState.attemptsOnCurrentWord === 2) winChance = 0.8;
    else winChance = 1.0;
  } else {
    winChance = 0;
  }

  if (Math.random() < winChance) {
    moveAndDrop(obj, true);
  } else {
    setTimeout(() => {
      obj.el.style.transition = 'top 0.5s ease-in'; 
      obj.el.style.top = '120%'; 
      
      clawAssembly.classList.remove('closed'); SFX.lose(); 
      
      if (isCorrect) {
         speak("Oh, so close!");
      } else {
         speak("Try again");
         gameState.score = Math.max(0, gameState.score - 20); 
         scoreDisplay.innerText = gameState.score;
      }

      setTimeout(() => {
         obj.el.style.transition = 'none';
         obj.el.style.top = 'auto';
         obj.el.style.bottom = '3vh';
         btnGrab.disabled = false;
      }, 800);
    }, 500);
  }
}

function moveAndDrop(obj, isWin) {
  const dropTarget = '7%';
  
  clawAssembly.style.transition = 'left 1s ease'; 
  clawAssembly.style.left = dropTarget;
  
  obj.el.style.transition = 'left 1s ease';
  obj.el.style.left = dropTarget;
  
  SFX.move();
  
  setTimeout(() => {
    clawAssembly.classList.remove('closed'); 
    
    obj.el.style.transition = 'top 0.5s ease-in'; 
    obj.el.style.top = '120%'; 
    SFX.drop();
    
    if (isWin) {
      SFX.win(); 
      let pts = (gameState.attemptsOnCurrentWord === 1) ? 500 : (gameState.attemptsOnCurrentWord === 2 ? 300 : 100);
      gameState.score += pts; 
      scoreDisplay.innerText = gameState.score;
      setTimeout(nextRound, 1000);
    }
    
    setTimeout(() => { clawAssembly.style.transition = 'none'; }, 1000);
  }, 1100);
}

function endGame() {
  gameState.isPlaying = false; finalScore.innerText = gameState.score;
  resultModal.style.display = 'flex';
}

function speak(txt) {
  if (synth.speaking) synth.cancel();
  
  let textToSpeak = txt;

  if (txt.length <= 2) {
    let letter = txt.charAt(0);
    if (letter === 'Ｉ') letter = 'I';
    textToSpeak = letter;
  }

  const u = new SpeechSynthesisUtterance(textToSpeak);
  u.lang = 'en-US'; 
  u.rate = 0.6; 
  if (femaleVoice) u.voice = femaleVoice;
  
  synth.speak(u);
}

// 預設渲染字母表
renderLetterGrid();
