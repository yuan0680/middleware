
class VoiceAssistant {
    // 1.构造函数 - 初始化语音助手实例，接收API密钥作为参数

    constructor(apiKey) {
      // 从localStorage恢复状态
  const savedHistory = localStorage.getItem('conversationHistory');
  if (savedHistory) {
    this.conversationHistory = JSON.parse(savedHistory);
  }
        this.initMiniProgramCommunication();
        this.initMessageListener();
        this.setupFloatingControls = this.setupFloatingControls.bind(this);
        this.recognition = null;
        this.isListening = false;
        this.isSpeaking = false;
        this.audioQueue = [];
        this.voices = [];
        this.animationId = null;
        this.shouldKeepListening = false;
        this.hasUserPermission = false;
        this.canvas = document.getElementById('waveform');
        this.ctx = this.canvas?.getContext('2d') || null;
        this.apiKey = apiKey;
        this.speechEndRestartTimer = null; // 语音播报后重启计时器
        this.conversationHistory = [
            {
                role: "system",
                content: "你的名字是小瞳同学，你是一个智能驾驶地空联合视觉感知系统小助手，可以对用户的问题进行回答，每句话控制在1-3句话。"
            }
        ];
        this.isProcessing = false;
        this.currentTranscript = '';
        
        // 语音识别相关变量
        this.lastVoiceActivityTime = null;
        this.inactivityTimer = null;
        this.inactivityTimeout = 60000;
        this.errorCount = 0;
        this.maxErrorCount = 5;
        
        // 删除健康检查相关变量
        
        this.init();
        
        setTimeout(() => {
            this.initSpeechRecognition();
        }, 1000);
    }
// 每次对话后保存状态
processCommand(command) {
  // ...处理逻辑
  localStorage.setItem('conversationHistory', JSON.stringify(this.conversationHistory));
}
  // 新增：初始化消息监听
  initMessageListener() {
    // 监听小程序通过 postMessage 发送的消息
    if (window.addEventListener) {
      window.addEventListener('message', (e) => this.handleMiniProgramMessage(e), false);
    } else if (window.attachEvent) { // 兼容旧浏览器
      window.attachEvent('onmessage', (e) => this.handleMiniProgramMessage(e));
    }
    console.log('✅ 已初始化小程序消息监听');
  }

  // 新增：处理小程序消息
  handleMiniProgramMessage(event) {
    const { type, data } = event.data;
    console.log(`📩 收到小程序消息: ${type}`, data);

    // 根据消息类型执行对应操作
    switch (type) {
      case 'START_LISTENING':
        this.startListening(); // 开始语音识别
        break;
      case 'STOP_LISTENING':
        this.stopListening(); // 中断语音识别
        break;
      case 'CHANGE_PAGE':
        this.navigateToPage(data.url); // 跳转页面
        break;
      case 'ADJUST_VOLUME':
        this.setVolume(data.volume); // 调整音量
        break;
      case 'TOGGLE_ASSISTANT':
        this.toggleAssistantVisibility(); // 显示/隐藏助手面板
        break;
      default:
        console.warn(`⚠️ 未知消息类型: ${type}`);
    }
  }
 // 新增：开始监听（语音识别）
  startListening() {
    if (this.isListening) {
      console.log('⏸️ 已在监听中，无需重复开始');
      return;
    }
    if (!this.recognition) {
      this.initSpeechRecognition(); // 初始化识别器
      // 延迟启动，确保初始化完成
      setTimeout(() => this.recognition.start(), 500);
    } else {
      this.recognition.start();
    }
  }

  // 新增：停止监听（中断语音识别）
  stopListening() {
    if (!this.isListening || !this.recognition) return;
    this.recognition.stop();
    this.isListening = false;
    this.stopWaveformAnimation();
    console.log('⏹️ 已停止语音识别');
    this.updateUI('idle', '已中断识别');
  }
// 新增：跳转页面（修改 iframe  src）
navigateToPage(url) {
  if (!url) {
    console.error('❌ 页面跳转失败：URL 为空');
    return;
  }
  const contentFrame = document.getElementById('contentFrame');
  if (contentFrame) {
    contentFrame.src = url; // 更新 iframe 地址
    console.log(`🔗 已跳转至页面: ${url}`);
    // 可选：通知小程序跳转成功
    this.postMessageToMiniProgram('PAGE_CHANGED', { url });
  } else {
    console.error('❌ 未找到 contentFrame 元素');
  }
}

// 新增：向小程序发送消息（可选，用于回传状态）
postMessageToMiniProgram(type, data) {
  if (window.parent) {
    window.parent.postMessage({ type, data }, '*'); // 注意：生产环境需限制 origin
    console.log(`📤 向小程序发送消息: ${type}`, data);
  }
}

// 新增：调整音量（支持背景音乐和语音）
setVolume({ type, value }) {
  if (value < 0 || value > 1) {
    console.error('❌ 音量值必须在 0-1 之间');
    return;
  }
  // 调整背景音乐音量
  if (type === 'background') {
    const bgMusic = document.getElementById('backgroundMusic');
    if (bgMusic) {
      bgMusic.volume = value;
      console.log(`🔊 背景音乐音量已调整为: ${value}`);
    }
  }
  // 调整语音播报音量（需结合语音合成逻辑）
  else if (type === 'speech') {
    this.speechVolume = value; // 存储音量值，在语音合成时使用
    console.log(`🔊 语音播报音量已调整为: ${value}`);
  }
}
// 新增：切换助手面板可见性
toggleAssistantVisibility() {
  const container = document.getElementById('assistantContainer');
  if (container) {
    const isHidden = container.style.display === 'none' || !container.style.display;
    container.style.display = isHidden ? 'block' : 'none';
    console.log(`🖥️ 助手面板已${isHidden ? '显示' : '隐藏'}`);
  } else {
    console.error('❌ 未找到 assistantContainer 元素');
  }
}

    // 2.初始化语音识别 - 设置语音识别功能
    initSpeechRecognition() {
        console.log('=== 初始化语音识别 ===');
        console.log('初始化时间:', new Date().toISOString());
        
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('❌ 浏览器不支持语音识别功能');
            this.showMessage('您的浏览器不支持语音识别功能', 'error');
            return;
        }
    
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // 识别器配置
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-CN';
        this.recognition.maxAlternatives = 1;


    
        // 语音活动检测变量
        this.lastVoiceActivityTime = null;
        this.inactivityTimer = null;
        this.inactivityTimeout = 60000; // 1分钟无活动超时
        this.isSpeaking = false; // 语音播报状态
    
        // === 事件处理 ===
    
        this.recognition.onstart = () => {
            console.log('🎤 语音识别开始');
            console.log('开始时间:', new Date().toISOString());
            this.isListening = true;
            this.hasUserPermission = true;
            this.errorCount = 0; // 重置错误计数
            
            // 重置语音活动时间
            this.lastVoiceActivityTime = Date.now();
            console.log('⏰ 重置语音活动时间:', new Date(this.lastVoiceActivityTime).toISOString());
            
            // 启动无活动检测
            this.startInactivityDetection();
            
            this.updateUI('listening', '正在聆听...');
            this.startWaveformAnimation();
            
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.classList.add('listening');
            
        };
    
        // 在语音识别到语音时清除重启计时器
        this.recognition.onresult = (event) => {
            console.log('📝 收到语音识别结果');
            console.log('结果数量:', event.results.length);
            
            // 清除语音播报后的重启计时器（用户说话了）
            if (this.speechEndRestartTimer) {
                clearTimeout(this.speechEndRestartTimer);
                this.speechEndRestartTimer = null;
                console.log('🗣️ 检测到语音输入，清除语音播报复位计时器');
            }
            
            // 更新最后语音活动时间
            this.lastVoiceActivityTime = Date.now();
            console.log('🔄 更新语音活动时间:', new Date(this.lastVoiceActivityTime).toISOString());
            
            // 重置无活动计时器
            this.resetInactivityTimer();
            
            let interimTranscript = '';
            let finalTranscript = '';
            let hasFinalResult = false;
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const isFinal = event.results[i].isFinal;
                
                console.log(`结果 ${i}: "${transcript}" (${isFinal ? '最终' : '临时'})`);
                
                if (isFinal) {
                    finalTranscript += transcript;
                    hasFinalResult = true;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            this.updateTranscript(interimTranscript, finalTranscript);
            
            // 处理最终结果
            if (finalTranscript.trim() && !this.isProcessing && !this.isSpeaking) {
                console.log('🎯 处理用户命令:', finalTranscript.trim());
                this.processCommand(finalTranscript.trim());
            }
            
            // 如果有任何结果（包括临时结果），都视为语音活动
            if (interimTranscript.trim() || finalTranscript.trim()) {
                console.log('🗣️ 检测到语音活动，重置无活动计时器');
            }
        };

    
        this.recognition.onspeechstart = () => {
            console.log('🎙️ 检测到语音开始');
            this.lastVoiceActivityTime = Date.now();
            this.resetInactivityTimer();
        };
    
        this.recognition.onspeechend = () => {
            console.log('🔇 检测到语音结束');
            // 不停止识别，只是记录语音段结束
            console.log('语音段结束，继续监听...');
        };
    
        this.recognition.onerror = (event) => {
            console.error('❌ 语音识别错误详情:');
            console.error('错误类型:', event.error);
            console.error('错误信息:', event.message);
            console.error('发生时间:', new Date().toISOString());
            
            this.errorCount++;
            
            switch(event.error) {
                case 'no-speech':
                    console.log('原因: 未检测到语音输入');
                    // 不停止识别，继续等待
                    this.errorCount--; // 不增加严重错误计数
                    break;
                    
                case 'audio-capture':
                    console.log('原因: 麦克风不可用或被其他程序占用');
                    this.showMessage('无法访问麦克风，请检查设备连接', 'error');
                    this.stopListeningDueToError();
                    break;
                    
                case 'not-allowed':
                    console.log('原因: 用户拒绝麦克风权限或页面不安全(非HTTPS)');
                    this.hasUserPermission = false;
                    this.shouldKeepListening = false;
                    this.showMessage('麦克风访问被禁用，请允许访问麦克风', 'error');
                    this.stopListeningDueToError();
                    break;
                    
                case 'network':
                    console.log('原因: 网络连接问题');
                    this.showMessage('网络连接错误，请检查网络', 'error');
                    this.stopListeningDueToError();
                    break;
                    
                default:
                    console.log('原因: 其他错误');
                    this.showMessage('语音识别出错，请重试', 'error');
            }
            
            // 错误次数过多时停止
            if (this.errorCount >= this.maxErrorCount) {
                console.log('🛑 错误次数过多，停止语音识别');
                this.stopListeningDueToError();
            }
        };
    
        this.recognition.onend = () => {
            console.log('⏹️ 语音识别会话结束');
            console.log('结束时间:', new Date().toISOString());
            console.log('最后语音活动时间:', this.lastVoiceActivityTime ? new Date(this.lastVoiceActivityTime).toISOString() : '无记录');
            
            this.isListening = false;
            this.stopInactivityDetection();
            
            const timeSinceLastActivity = this.lastVoiceActivityTime ? 
                Date.now() - this.lastVoiceActivityTime : 0;
            
            console.log(`距离最后语音活动: ${timeSinceLastActivity}ms`);
            
            if (timeSinceLastActivity >= this.inactivityTimeout) {
                console.log('🕒 因1分钟无语音活动而结束识别');
                this.showMessage('1分钟无语音输入，识别已结束', 'info');
                this.updateUI('idle', '1分钟无语音输入，识别已结束');
            } else {
                console.log('🔧 语音识别因其他原因结束，保持停止状态');
                this.updateUI('idle', '识别已结束，点击麦克风重新开始');
            }
            
            this.stopWaveformAnimation();
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.classList.remove('listening');
            
            // 确保这里没有任何 setTimeout 重启代码
        };
            
        
    }

    // 3.初始化 - 执行整体初始化流程
            init() {
                this.setupCanvas();
                this.setupEventListeners();
                this.setupVoiceControls();
                this.checkAPIStatus();
                
                this.showMessage("欢迎使用小瞳同学智能语音助手！请点击麦克风按钮开始对话", 'assistant');
            }
     // 4.设置画布 - 配置用于绘制波形或其他图形的画布元素
            setupCanvas() {
                if (this.canvas && this.ctx) {
                    this.canvas.width = this.canvas.offsetWidth;
                    this.canvas.height = this.canvas.offsetHeight;
                    this.ctx.fillStyle = '#f8f9fa';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            }
     // 5.设置事件监听器 - 绑定各类用户交互事件。    
            setupEventListeners() {
                const toggleBtn = document.getElementById('toggleBtn');
                if (toggleBtn) {
                    toggleBtn.addEventListener('click', () => {
                        console.log('点击麦克风按钮');
                        this.toggleListening();
                    });
                }
        
                // 添加键盘快捷键
                document.addEventListener('keydown', (event) => {
                    if (event.key === ' ' && event.ctrlKey) { // Ctrl+空格
                        event.preventDefault();
                        this.toggleListening();
                    }
                });
            }
    // 6.设置语音控制 - 配置与语音输入相关的控制逻辑       
    setupVoiceControls() {
    const voiceSelect = document.getElementById('voiceSelect');
    const pitchControl = document.getElementById('pitchControl');
    const rateControl = document.getElementById('rateControl');
    const volumeControl = document.getElementById('volumeControl');
    const backgroundMusicControl = document.getElementById('backgroundMusicControl');
    
    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            console.log('语音选择变更');
            this.testVoice();
        });
    }
    if (pitchControl) pitchControl.addEventListener('input', () => this.testVoice());
    if (rateControl) rateControl.addEventListener('input', () => this.testVoice());
    if (volumeControl) {
        volumeControl.value = "1";
        localStorage.setItem('assistantVolume', '1');
        volumeControl.addEventListener('input', () => {
            localStorage.setItem('assistantVolume', volumeControl.value);
            this.testVoice();
        });
    }
    
    // 背景音乐控制
    if (backgroundMusicControl) {
        // 设置初始值为0.3
        backgroundMusicControl.value = "0.3";
        // 监听音量变化
        backgroundMusicControl.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.setBackgroundMusicVolume(volume);
        });
    }

    // 加载语音列表
    this.loadVoices();
}

// 添加背景音乐音量控制方法
setBackgroundMusicVolume(volume) {
    const backgroundMusic = document.getElementById('backgroundMusic');
    if (backgroundMusic) {
        backgroundMusic.volume = volume;
        console.log('背景音乐音量设置为:', volume);
        // 保存音量设置
        localStorage.setItem('backgroundMusicVolume', volume);
    }
}

// 在初始化时恢复背景音乐音量
init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupVoiceControls();
    this.checkAPIStatus();
    
    // 恢复背景音乐音量设置
    const savedVolume = localStorage.getItem('backgroundMusicVolume');
    if (savedVolume) {
        this.setBackgroundMusicVolume(parseFloat(savedVolume));
        const backgroundMusicControl = document.getElementById('backgroundMusicControl');
        if (backgroundMusicControl) {
            backgroundMusicControl.value = savedVolume;
        }
    }
    
    this.showMessage("欢迎使用小瞳同学智能语音助手！请点击麦克风按钮开始对话", 'assistant');
}

// 7.在语音识别开始时清除重启计时器
startListening() {
    console.log('🎯 开始监听...');
    
    // 清除语音播报后的重启计时器
    if (this.speechEndRestartTimer) {
        clearTimeout(this.speechEndRestartTimer);
        this.speechEndRestartTimer = null;
        console.log('🛑 清除语音播报重启计时器');
    }
    
    // 检查是否正在语音播报或处理中
    if (this.isSpeaking || this.isProcessing) {
        console.log('⏸️ 正在说话或处理中，稍后开始监听');
        this.shouldKeepListening = true;
        return;
    }

    if (!this.recognition) {
        console.log('🔄 语音识别未初始化，重新初始化');
        this.initSpeechRecognition();
    }
    
    if (!this.recognition) {
        this.showMessage('您的浏览器不支持语音识别功能', 'error');
        return;
    }

    if (this.isListening) {
        console.log('⚠️ 已经在监听中');
        return;
    }

    try {
        this.shouldKeepListening = true;
        this.recognition.start();
        console.log('✅ 语音识别启动成功');
        
        this.updateUI('listening', '正在聆听...');
        this.startWaveformAnimation();
        
    } catch (error) {
        console.error('❌ 启动语音识别失败:', error);
        
        if (error.name === 'InvalidStateError') {
            console.log('🔧 InvalidStateError: 识别器已经在运行，更新状态');
            this.isListening = true;
            this.updateUI('listening', '正在聆听...');
            this.startWaveformAnimation();
            return;
        }
        
        this.showMessage('启动语音识别失败，请重试', 'error');
    }
}

// 8.在停止监听时也清除重启计时器
stopListening() {
    console.log('🛑 停止监听');
    this.shouldKeepListening = false;
    
    // 清除语音播报后的重启计时器
    if (this.speechEndRestartTimer) {
        clearTimeout(this.speechEndRestartTimer);
        this.speechEndRestartTimer = null;
        console.log('🛑 清除语音播报重启计时器');
    }
    
    // 停止无活动检测
    this.stopInactivityDetection();
    
    if (this.recognition && this.isListening) {
        try {
            this.recognition.stop();
            console.log('✅ 语音识别停止成功');
        } catch (error) {
            console.error('❌ 停止语音识别失败:', error);
        }
    }
    
    this.isListening = false;
    this.updateUI('idle', '已停止');
    this.stopWaveformAnimation();
    
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn) toggleBtn.classList.remove('listening');
}




// 9.切换监听状态 - 在开始和停止监听之间切换。
toggleListening() {
    console.log('🔄 切换监听状态, 当前状态:', this.isListening);
    
    if (this.isProcessing) {
        this.showMessage("正在处理上一个请求，请稍候...", 'assistant');
        return;
    }
    
    if (this.isListening) {
        this.stopListening();
        this.showMessage("已停止监听", 'assistant');
    } else {
        this.startListening();
        this.showMessage("开始监听，请说话...", 'assistant');
    }
}

// 语音播报结束后启动1分钟重启计时器
restartAfterSpeech() {
    console.log('🔄 语音播报结束，启动1分钟重启计时器');
    this.isSpeaking = false;
    this.updateUI('idle', '语音播报结束，正在等待语音输入...');
    
    // 设置1分钟重启计时器
    this.speechEndRestartTimer = setTimeout(() => {
        console.log('🕒 语音播报结束1分钟后无语音输入，自动重启语音识别');
        if (this.shouldKeepListening && !this.isListening && !this.isSpeaking) {
            this.startListening();
        }
    }, 60000); // 1分钟后重启
    
    console.log('⏰ 1分钟重启计时器已启动');
}


// 启动无活动检测
startInactivityDetection() {
    console.log('🔍 启动无活动检测');
    this.resetInactivityTimer();
}

// 重置无活动计时器
resetInactivityTimer() {
    // 清除现有计时器
    if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
    }
    
    // 设置新的无活动计时器（1分钟）
    this.inactivityTimer = setTimeout(() => {
        console.log('🕒 1分钟无语音活动，停止识别');
        this.stopListeningDueToInactivity();
    }, 60000); // 1分钟
    
    console.log('🔄 重置无活动计时器');
}

// 停止无活动检测
stopInactivityDetection() {
    if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
        console.log('🛑 停止无活动检测');
    }
}

// 因无活动停止监听
stopListeningDueToInactivity() {
    console.log('🛑 因无活动停止语音识别');
    this.shouldKeepListening = false;
    this.stopInactivityDetection();
    
    if (this.recognition && this.isListening) {
        try {
            this.recognition.stop();
        } catch (error) {
            console.error('停止识别时出错:', error);
        }
    }
    
    this.isListening = false;
    this.showMessage('1分钟无语音输入，识别已自动结束', 'info');
    this.updateUI('idle', '1分钟无语音输入，识别已结束');
    this.stopWaveformAnimation();
    
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn) toggleBtn.classList.remove('listening');
}
     // 10.语音播报 - 异步方法，将文本转换为语音输出。
            async speak(text) {
                console.log('开始说话:', text);
                return new Promise((resolve) => {
                    if (this.isSpeaking) {
                        console.log('正在说话，加入队列');
                        this.audioQueue.push({text, resolve});
                        return;
                    }
                    
                    if (!('speechSynthesis' in window)) {
                        console.warn('浏览器不支持语音合成');
                        resolve();
                        return;
                    }
                    
                    const synthesis = window.speechSynthesis;
                    if (synthesis.speaking) {
                        synthesis.cancel();
                    }
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = 'zh-CN';
                    
                    // 应用语音设置
                    const voiceSelect = document.getElementById('voiceSelect');
                    const pitchControl = document.getElementById('pitchControl');
                    const rateControl = document.getElementById('rateControl');
                    const volumeControl = document.getElementById('volumeControl');
                    
                    if (voiceSelect && this.voices.length > 0) {
                        const selectedVoice = this.voices[voiceSelect.value];
                        if (selectedVoice) {
                            utterance.voice = selectedVoice;
                        }
                    }
                    
                    if (pitchControl) utterance.pitch = parseFloat(pitchControl.value) || 1;
                    if (rateControl) utterance.rate = parseFloat(rateControl.value) || 1;
                    if (volumeControl) utterance.volume = parseFloat(volumeControl.value) || 1;
                    
                    this.isSpeaking = true;
                    
                    utterance.onend = () => {
                        console.log('语音播报结束');
                        this.isSpeaking = false;
                        
                        // 处理队列中的下一个语音
                        if (this.audioQueue.length > 0) {
                            const next = this.audioQueue.shift();
                            this.speak(next.text).then(next.resolve);
                        } else {
                            resolve();
                        }
                    };
                    
                    utterance.onerror = (event) => {
                        console.error('语音合成错误:', event.error);
                        this.isSpeaking = false;
                        resolve();
                    };
                    
                    try {
                        synthesis.speak(utterance);
                        console.log('语音合成开始');
                    } catch (error) {
                        console.error('语音播放失败:', error);
                        this.isSpeaking = false;
                        resolve();
                    }
                });
            }
    // 11.处理命令 - 异步方法，解析并执行用户指令。
            // 原代码中直接调用API的部分替换为：
async processCommand(command) {
  this.isProcessing = true;
  this.updateUI('processing', '正在处理...');
  
  this.conversationHistory.push({
    role: "user",
    content: command
  });
  
  // 调用云函数处理对话
  wx.cloud.callFunction({
    name: 'voiceAssistant',
    data: {
      action: 'processConversation',
      data: this.conversationHistory
    }
  }).then(res => {
    if (res.result.code === 0) {
      const assistantMessage = res.result.data;
      this.conversationHistory.push(assistantMessage);
      this.showMessage(assistantMessage.content, 'assistant');
      this.speak(assistantMessage.content);
    } else {
      this.showMessage('处理失败: ' + res.result.message, 'error');
    }
    this.isProcessing = false;
    this.updateUI('listening', '正在聆听...');
  }).catch(err => {
    console.error('调用云函数失败:', err);
    this.showMessage('服务连接失败，请重试', 'error');
    this.isProcessing = false;
    this.updateUI('idle', '点击麦克风开始');
  });
}
    // 12.加载语音库 - 加载可用的语音合成声音。
    loadVoices() {
        return new Promise(resolve => {
            const updateVoices = () => {
                this.voices = window.speechSynthesis.getVoices();
                console.log('加载到语音数量:', this.voices.length);
                
                const voiceSelect = document.getElementById('voiceSelect');
                if (!voiceSelect) return;
                
                voiceSelect.innerHTML = '';
                
                this.voices.forEach((voice, i) => {
                    const option = document.createElement("option");
                    option.value = i;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    
                    // 修改这里的默认语音选择条件
                    // 方法1: 选择特定语音名称
                    if (voice.name.includes('Microsoft Xiaoxiao') || voice.name.includes('Xiaoxiao')) {
                        option.selected = true;
                    }
                    // 方法2: 选择特定语言
                    // if (voice.lang === 'zh-CN' || voice.lang === 'zh-HK' || voice.lang === 'zh-TW') {
                    //     option.selected = true;
                    // }
                    // 方法3: 选择女性声音
                    // if (voice.name.toLowerCase().includes('female') || voice.name.includes('女') || voice.name.includes('Xiaoxiao') || voice.name.includes('Huihui')) {
                    //     option.selected = true;
                    // }
                    
                    voiceSelect.appendChild(option);
                });
                
                resolve();
            };
            
            if (window.speechSynthesis.getVoices().length === 0) {
                window.speechSynthesis.onvoiceschanged = updateVoices;
            } else {
                updateVoices();
            }
        });
    }
    // 13.测试语音 - 用于测试语音合成功能。
            testVoice() {
                console.log('测试语音');
                if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                }
                this.speak("这是语音测试");
            }
     // 14.更新用户界面 - 根据状态和信息更新UI显示。
            updateUI(state, message) {
                const statusIndicator = document.getElementById('statusIndicator');
                if (!statusIndicator) return;
                
                statusIndicator.className = 'status-indicator';
                if (state === 'listening') {
                    statusIndicator.classList.add('status-listening');
                } else if (state === 'processing') {
                    statusIndicator.classList.add('status-processing');
                } else {
                    statusIndicator.classList.add('status-idle');
                }
                statusIndicator.textContent = message;
            }
    // 15.更新转录文本 - 更新临时或最终的语音识别文本。
            updateTranscript(interim, final) {
                const transcriptDiv = document.getElementById('transcript');
                if (!transcriptDiv) return;
                
                const interimEl = document.getElementById('interimTranscript');
                if (interimEl) interimEl.remove();
                
                if (interim) {
                    const interimContainer = document.createElement('div');
                    interimContainer.id = 'interimTranscript';
                    interimContainer.className = 'message interim-message';
                    interimContainer.innerHTML = `
                        <div class="message-header">🎤 正在识别</div>
                        <div class="message-content">${interim}</div>
                    `;
                    transcriptDiv.appendChild(interimContainer);
                }
                
                if (final) {
                    const finalContainer = document.createElement('div');
                    finalContainer.className = 'message user-message';
                    finalContainer.innerHTML = `
                        <div class="message-header">👤 您说</div>
                        <div class="message-content">${final}</div>
                    `;
                    transcriptDiv.appendChild(finalContainer);
                }
                
                transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
            }
    // 16.检查预设命令 - 判断是否为预设的系统命令
            checkPresetCommands(command) {
                command = command.toLowerCase();
                console.log('检查预设命令:', command);
                
                if (command.includes('介绍一下我们的作品') || command.includes('作品简介')) {
                    return '作品通过无人机低空监测与车载端感知相结合，结合云端大数据分析，实现交通环境的全方位立体化感知，并通过数字可视化平台进行集成展示。系统功能包括实时目标检测与分类、车流量实时监测、交通态势预测与路径规划，并提供可视化交互界面。';
                }
                
                if (command.includes('开始讲解') || command.includes('第一页')) {
                    return '作品特点在于：一方面利用生成式人工智能（AIGC）技术自动生成动态图表、报告与交互界面，使信息表达更高效直观；另一方面兼具学术价值与应用潜力，可在智能驾驶辅助、智慧交通管理、应急救援调度等场景中推广应用，具有较高的转化价值与社会意义。';
                }
        
                if (command.includes('跳转到第二页') || command.includes('打开第二页')) {
                    setTimeout(() => {
                        window.location.href = 'try_1.html';
                    }, 1000);
                    return '正在为您跳转到第二页';
                }
                
                if (command.includes('跳转到第三页') || command.includes('打开第三页')) {
                    setTimeout(() => {
                        window.location.href = 'try_2.html';
                    }, 1000);
                    return '正在为您跳转到第三页'
                }
                
                if (command.includes('跳转到第四页') || command.includes('打开第四页')) {
                    setTimeout(() => {
                        window.location.href = 'try_3.html';
                    }, 1000);
                    return '正在为您跳转到第四页';
                }
                
                if (command.includes('跳转到第五页') || command.includes('打开第五页')) {
                    setTimeout(() => {
                        window.location.href = 'try_4.html';
                    }, 1000);
                    return '正在为您跳转到第五页';
                }
                
                if (command.includes('第一页') || command.includes('打开第一页')) {
                    setTimeout(() => {
                        window.location.href = 'try1.html';
                    }, 1000);
                    return '正在为您跳转到第一页';
                }
                
                if (command.includes('重置') || command.includes('重新开始')) {
                    this.conversationHistory = [
                        {
                            role: "system",
                            content: "你的名字是小瞳同学，你是一个智能驾驶地空联合视觉感知系统小助手，可以对用户的问题进行回答，每句话控制在1-3句话。"
                        }
                    ];
                    return '对话已重置，我们可以重新开始对话';
                }
                
                if (command.includes('帮助')) {
                    return '我可以回答智能驾驶地空联合视觉感知系统相关问题，帮助您了解本系统架构，也可以进行页面跳转等操作。请点击麦克风按钮开始对话。';
                }
                
                if (command.includes('时间')) {
                    return `现在是 ${new Date().toLocaleTimeString('zh-CN')}`;
                }
        
                if (command.includes('播放音乐') || command.includes('打开音乐')) {
                    const backgroundMusic = document.getElementById('backgroundMusic');
                    if (backgroundMusic) {
                        backgroundMusic.play();
                        return '背景音乐已播放';
                    }
                }
                
                if (command.includes('停止音乐') || command.includes('关闭音乐')) {
                    const backgroundMusic = document.getElementById('backgroundMusic');
                    if (backgroundMusic) {
                        backgroundMusic.pause();
                        return '背景音乐已停止';
                    }
                }
                
                return null;
            }
     //17. 显示思考状态 - 在界面上展示“正在思考”的状态。
            showThinking() {
                const transcriptDiv = document.getElementById('transcript');
                if (!transcriptDiv) return;
                
                const thinkingContainer = document.createElement('div');
                thinkingContainer.id = 'thinkingIndicator';
                thinkingContainer.className = 'message assistant-message';
                thinkingContainer.innerHTML = `
                    <div class="message-header">🤖 小瞳同学</div>
                    <div class="thinking-indicator">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                        思考中
                    </div>
                `;
                transcriptDiv.appendChild(thinkingContainer);
                transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
            }
     // 18.调用DeepSeek API - 异步方法，向DeepSeek API发送请求，可设置为测试模式。
            async callDeepSeekAPI(prompt, isTest = false) {
                console.log('调用DeepSeek API');
                const apiEndpoint = "https://api.deepseek.com/v1/chat/completions";
                
                const payload = {
                    model: "deepseek-chat",
                    messages: [...this.conversationHistory, { role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 500
                };
                
                try {
                    const response = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('API响应错误:', response.status, errorText);
                        throw new Error(`API请求失败: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    return data.choices[0].message.content;
                } catch (error) {
                    console.error('API调用失败:', error);
                    throw error;
                }
            }
     //19. 显示消息 - 在界面上显示指定类型的消息。
            showMessage(text, type) {
                const transcriptDiv = document.getElementById('transcript');
                if (!transcriptDiv) return;
                
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${type === 'assistant' ? 'assistant-message' : type === 'error' ? 'error-message' : 'user-message'}`;
                messageDiv.innerHTML = `
                    <div class="message-header">${type === 'assistant' ? '🤖 小瞳同学' : type === 'error' ? '❌ 错误' : '👤 您'}</div>
                    <div class="message-content">${text}</div>
                `;
                transcriptDiv.appendChild(messageDiv);
                transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
            }
     // 20.开始波形动画 - 启动语音波形的动画效果。
            startWaveformAnimation() {
                if (!this.canvas || !this.ctx) return;
                
                if (this.animationId) cancelAnimationFrame(this.animationId);
                
                let amplitudes = new Array(20).fill(0);
                const draw = () => {
                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    
                    amplitudes.push(Math.random() * 50 + 20);
                    amplitudes.shift();
                    
                    const centerY = this.canvas.height / 2;
                    const barWidth = this.canvas.width / amplitudes.length;
                    
                    this.ctx.fillStyle = '#667eea';
                    for (let i = 0; i < amplitudes.length; i++) {
                        const height = amplitudes[i];
                        this.ctx.fillRect(i * barWidth, centerY - height/2, barWidth * 0.6, height);
                    }
                    
                    this.animationId = requestAnimationFrame(draw);
                };
                draw();
            }
     //21. 停止波形动画 - 停止语音波形的动画效果。
            stopWaveformAnimation() {
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
            }
    // 22.检查API状态 - 异步方法，检查API服务是否可用。
            async checkAPIStatus() {
                try {
                    await this.callDeepSeekAPI("回复'连接成功'", true);
                    this.showMessage("小瞳同学已就绪，可以开始对话", 'assistant');
                } catch (error) {
                    console.error('API连接测试失败:', error);
                    this.showMessage("API连接失败，使用基础功能模式", 'error');
                }
            }
     // 23.设置浮动控制面板 - 配置浮动式控制界面元素。
     setupFloatingControls() {
        const voiceIcon = document.getElementById('voiceIcon');
        const assistantContainer = document.getElementById('assistantContainer');
        const closeBtn = document.querySelector('.close-btn');
        const minimizeBtn = document.querySelector('.minimize-btn');
        
        // 双击语音图标显示/隐藏小助手
        if (voiceIcon && assistantContainer) {
            voiceIcon.addEventListener('dblclick', () => {
                this.toggleAssistantWindow();
            });
        }
        
        // 关闭按钮 - 隐藏窗口并停止监听
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                assistantContainer.style.display = 'none';
                this.stopListening();
                console.log('小助手已关闭');
            });
        }
        
        // 最小化按钮 - 只隐藏窗口，功能继续运行
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                assistantContainer.style.display = 'none';
                console.log('小助手窗口已最小化，语音功能继续运行...');
                
                // 如果之前正在监听，继续监听
                if (this.shouldKeepListening && !this.isListening && this.hasUserPermission) {
                    setTimeout(() => {
                        this.startListening();
                    }, 500);
                }
            });
        }
    }
    
    // 切换小助手窗口显示/隐藏
    toggleAssistantWindow() {
        const assistantContainer = document.getElementById('assistantContainer');
        if (!assistantContainer) return;
        
        const isVisible = assistantContainer.style.display === 'block';
        assistantContainer.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            console.log('显示小助手窗口');
            // 显示窗口时自动开始监听
            setTimeout(() => {
                if (!this.isListening && this.hasUserPermission) {
                    this.startListening();
                }
            }, 500);
        } else {
            console.log('隐藏小助手窗口');
        }
    }
        }



 // 24.文档加载完成事件 - 当初始HTML文档完全加载后执行初始化代码。
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM加载完成，初始化语音助手');
            
            const apiKey = 'sk-786ae55865b84f3096687b7a04560430';
            
            // 设置音量
            const volumeControl = document.getElementById('volumeControl');
            if (volumeControl) {
                volumeControl.value = '1';
                localStorage.setItem('assistantVolume', '1');
            }
            
            // 创建语音助手实例
            window.assistant = new VoiceAssistant(apiKey);
            
            // 设置浮动控制
            setTimeout(() => {
                if (window.assistant.setupFloatingControls) {
                    window.assistant.setupFloatingControls();
                }
            }, 1000);
            
            console.log("小瞳同学语音助手初始化完成");
        });
