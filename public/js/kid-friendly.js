const dashboard = document.querySelector('#dashboard');
const dashboardHeading = dashboard?.querySelector('.welcome-row h1');
if (dashboardHeading) dashboardHeading.textContent = 'Pick a little adventure! 🌈';

const dashboardIntro = dashboard?.querySelector('.welcome-row .muted');
if (dashboardIntro) dashboardIntro.textContent = 'Tap a big button to start playing.';

const activityHeading = dashboard?.querySelector(':scope > h2');
if (activityHeading) activityHeading.textContent = 'What sounds fun?';

const activityCopy = [
  ['Talk to Buddy', 'Say hello or ask a question'],
  ['Find a word', 'Look, listen, and practice'],
  ['Learn a lesson', 'Explore your level step by step'],
  ['Play a quiz', 'Pick a picture answer'],
  ['Name a feeling', 'All feelings are welcome']
];
dashboard?.querySelectorAll('.action-card').forEach((card, index) => {
  const [label, hint] = activityCopy[index] || [];
  if (label) {
    card.querySelector('b').textContent = label;
    card.querySelector('small').textContent = hint;
    card.setAttribute('aria-label', `${label}. ${hint}.`);
  }
});

if (dashboard) {
  const instruction = document.createElement('p');
  instruction.className = 'kid-instruction';
  instruction.textContent = 'Choose one thing. You can try something else whenever you like.';
  activityHeading?.after(instruction);
}

const wordHeading = document.querySelector('#wordsScreen .screen-heading');
if (wordHeading) {
  const instruction = document.createElement('p');
  instruction.className = 'kid-instruction';
  instruction.textContent = 'Tap a word to listen or practice it with Buddy.';
  wordHeading.after(instruction);
}

const feelingsIntro = document.querySelector('#feelingsScreen > .muted');
if (feelingsIntro) feelingsIntro.textContent = 'Tap how you feel. You can keep it to yourself or tell Buddy.';

const buddyFeelingButton = document.querySelector('#buddyFeelingBtn');
if (buddyFeelingButton) buddyFeelingButton.textContent = 'Tell Buddy about it 💬';

const progressPanel = document.querySelector('.progress-panel');
if (progressPanel) {
  const garden = document.createElement('div');
  garden.className = 'garden-grow';
  garden.setAttribute('aria-live', 'polite');
  garden.innerHTML = '<span class="garden-grow-emoji" aria-hidden="true">🌱</span><p>Practice a word to help your garden grow!</p>';
  progressPanel.prepend(garden);
}

const progressBar = document.querySelector('#progressBar');
if (progressBar) {
  progressBar.parentElement.setAttribute('role', 'progressbar');
  progressBar.parentElement.setAttribute('aria-label', 'Words practiced in this level');
  progressBar.parentElement.setAttribute('aria-valuemin', '0');
  progressBar.parentElement.setAttribute('aria-valuemax', '100');
}

const categoryTabs = document.querySelector('#categoryTabs');
categoryTabs?.setAttribute('role', 'group');
categoryTabs?.setAttribute('aria-label', 'Choose a word group');
categoryTabs?.querySelectorAll('button').forEach(button => {
  button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
  button.addEventListener('click', () => {
    categoryTabs.querySelectorAll('button').forEach(tab => {
      tab.setAttribute('aria-pressed', tab === button ? 'true' : 'false');
    });
  });
});

const quizCard = document.querySelector('#quizCard');
if (quizCard) {
  const meter = document.createElement('div');
  meter.className = 'quiz-progress-meter';
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Quiz questions completed');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.innerHTML = '<span id="quizMeterFill"></span>';
  quizCard.querySelector('.quiz-progress')?.after(meter);
}

const feelings = document.querySelectorAll('.feelings-grid button');
feelings.forEach(button => {
  button.setAttribute('aria-pressed', 'false');
});

const wordGrid = document.querySelector('#wordGrid');
if (wordGrid) {
  wordGrid.setAttribute('aria-live', 'polite');
  wordGrid.setAttribute('aria-label', 'Words to explore');
  const wordExplorerTools = document.createElement('div');
  wordExplorerTools.className = 'word-explorer-tools';
  wordExplorerTools.innerHTML = '<p class="word-count" id="wordCount" aria-live="polite">Let’s find a new word!</p><p class="word-tip"><span aria-hidden="true">✨</span> Tap Listen to hear a word, or Practice to play with Buddy.</p>';
  wordGrid.before(wordExplorerTools);
}

const chatCard = document.querySelector('.chat-card');
if (chatCard) {
  chatCard.classList.add('buddy-chat-card');

  const buddyAvatar = chatCard.querySelector('.buddy-banner > span:first-child');
  buddyAvatar?.classList.add('buddy-avatar');
  buddyAvatar?.setAttribute('aria-hidden', 'true');

  const buddyDescription = chatCard.querySelector('.buddy-banner small');
  if (buddyDescription) buddyDescription.textContent = 'I love stories, words, and games!';

  const buddyStatus = chatCard.querySelector('.online-dot');
  if (buddyStatus) {
    buddyStatus.textContent = '● Ready to chat!';
    buddyStatus.setAttribute('aria-label', 'Buddy is ready to chat');
  }

  const messages = chatCard.querySelector('#messages');
  messages?.setAttribute('role', 'log');
  messages?.setAttribute('aria-label', 'Chat with Buddy');
  messages?.setAttribute('aria-relevant', 'additions');

  const suggestions = chatCard.querySelector('.suggestions');
  if (suggestions) {
    const suggestionLabel = document.createElement('p');
    suggestionLabel.className = 'buddy-suggestion-label';
    suggestionLabel.textContent = 'Pick something to say:';
    suggestions.before(suggestionLabel);
    suggestions.setAttribute('aria-label', 'Try one of these messages');
  }

  const chatInput = chatCard.querySelector('#chatInput');
  chatInput?.setAttribute('placeholder', 'Say something to Buddy…');
  chatInput?.setAttribute('aria-label', 'Type a message to Buddy');

  const micButton = chatCard.querySelector('#micBtn');
  micButton?.setAttribute('aria-label', 'Talk to Buddy using your voice');
  if (micButton) micButton.title = 'Talk to Buddy using your voice';

  const sendButton = chatCard.querySelector('.send-btn');
  sendButton?.setAttribute('aria-label', 'Send message to Buddy');
}
