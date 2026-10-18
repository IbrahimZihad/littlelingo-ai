import baseVocabulary from './vocabulary.json' with { type: 'json' };

const alphabetWords = {
  a: 'apple', b: 'ball', c: 'cat', d: 'dog', e: 'egg', f: 'fish',
  g: 'grapes', h: 'hat', i: 'ink', j: 'jam', k: 'kite', l: 'lion',
  m: 'moon', n: 'nest', o: 'orange', p: 'pear', q: 'queen', r: 'rabbit',
  s: 'sun', t: 'tree', u: 'umbrella', v: 'van',   w: 'whale',
  x: 'xylophone', y: 'yo-yo', z: 'zebra'
};

const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const smallNumbers = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
];

function numberName(value) {
  if (value === 100) return 'one hundred';
  if (value < 20) return smallNumbers[value];
  const ten = Math.floor(value / 10);
  const remainder = value % 10;
  return `${tens[ten]}${remainder ? `-${smallNumbers[remainder]}` : ''}`;
}

const alphabet = Object.entries(alphabetWords).map(([letter, example]) => ({
  id: `letter-${letter}`,
  word: `${letter.toUpperCase()} ${letter}`,
  emoji: '🔤',
  category: 'alphabet',
  sentence: `${letter.toUpperCase()} is for ${example}.`,
  level: 'L1'
}));

const levelOneNumbers = Array.from({ length: 7 }, (_, index) => {
  const number = index + 4;
  const name = numberName(number);
  return {
    id: `number-${name}`,
    word: `${number} (${name})`,
    emoji: '🔢',
    category: 'numbers',
    sentence: `Let's count ${number} ${number === 1 ? 'star' : 'stars'}!`,
    level: 'L1'
  };
});

const levelTwoNumbers = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1;
  const name = numberName(number);
  return {
    id: `number-l2-${number}`,
    word: `${number} (${name})`,
    emoji: '🔢',
    category: 'numbers',
    sentence: `The number ${number} is called ${name}.`,
    level: 'L2'
  };
});

const extraVocabulary = [
  ['purple', 'Purple', '💜', 'colors', 'The flower is purple.', 'L1'],
  ['pink', 'Pink', '🩷', 'colors', 'The pig is pink.', 'L1'],
  ['black', 'Black', '⚫', 'colors', 'The cat is black.', 'L1'],
  ['white', 'White', '⚪', 'colors', 'The snow is white.', 'L1'],
  ['brown', 'Brown', '🟤', 'colors', 'The bear is brown.', 'L1'],
  ['cow', 'Cow', '🐮', 'animals', 'The cow says moo.', 'L1'],
  ['duck', 'Duck', '🦆', 'animals', 'The duck can swim.', 'L1'],
  ['horse', 'Horse', '🐴', 'animals', 'The horse can run.', 'L1'],
  ['lion', 'Lion', '🦁', 'animals', 'The lion has a mane.', 'L1'],
  ['rabbit', 'Rabbit', '🐰', 'animals', 'The rabbit can hop.', 'L1'],
  ['elephant', 'Elephant', '🐘', 'animals', 'The elephant is big.', 'L1'],
  ['mango', 'Mango', '🥭', 'fruits', 'A mango is sweet.', 'L1'],
  ['grapes', 'Grapes', '🍇', 'fruits', 'Grapes grow in a bunch.', 'L1'],
  ['pear', 'Pear', '🍐', 'fruits', 'The pear is juicy.', 'L1'],
  ['strawberry', 'Strawberry', '🍓', 'fruits', 'The strawberry is red.', 'L1'],
  ['make-cat', 'c-a-t makes cat', '🐱', 'word-building', 'Sound it out: c-a-t. The sounds make cat.', 'L2'],
  ['make-sun', 's-u-n makes sun', '☀️', 'word-building', 'Sound it out: s-u-n. The sounds make sun.', 'L2'],
  ['make-map', 'm-a-p makes map', '🗺️', 'word-building', 'Sound it out: m-a-p. The sounds make map.', 'L2'],
  ['sentence-bird', 'I see the bird.', '🐦', 'sentences', 'Who? I. What do I do? see. What do I see? the bird.', 'L2'],
  ['sentence-dog', 'The dog can run.', '🐶', 'sentences', 'Read the whole sentence: The dog can run.', 'L2'],
  ['sentence-apple', 'I like a red apple.', '🍎', 'sentences', 'Read the whole sentence: I like a red apple.', 'L2'],
  ['sentence-scrambled', 'See bird the.', '🧩', 'sentences', 'Try putting the words in order: I see the bird.', 'L2'],
  ['sentence-fragment', 'Bird I.', '🔤', 'sentences', 'Add words to make a complete sentence: I see the bird.', 'L2'],
  ['story-mia', 'Mia and the Seed', '🌱', 'reading', 'Mia finds a little seed. She puts it in the soil and gives it water. The sun shines. Soon, a green plant grows. Mia smiles at her plant.', 'L3'],
  ['story-max', 'Max and the Red Kite', '🪁', 'reading', 'Max has a red kite. The wind blows softly. Up, up goes the kite! Max runs across the grass. He laughs as the kite dances in the sky.', 'L3'],
  ['story-fox', 'The Fox and the Pond', '🦊', 'reading', 'A small fox walks to a pond. It sees a frog on a rock. The frog jumps into the water. Splash! The fox waves goodbye.', 'L3'],
  ['sentence-builder', 'Make a sentence', '🧱', 'sentence-builder', 'Put the words in order: The / little / bird / can / fly.', 'L3'],
  ['sentence-builder-right', 'The little bird can fly.', '🐦', 'sentence-builder', 'The little bird can fly.', 'L3'],
  ['sentence-builder-wrong', 'Bird little the fly can.', '🧩', 'sentence-builder', 'Bird little the fly can.', 'L3'],
  ['sentence-builder-reversed', 'Fly can bird the little.', '🔤', 'sentence-builder', 'The little bird can fly.', 'L3'],
  ['fill-bright', 'bright', '☀️', 'fill-blanks', 'The sun is ___.', 'L3'],
  ['fill-swim', 'swim', '🐟', 'fill-blanks', 'Fish can ___.', 'L3'],
  ['fill-fly', 'fly', '🪽', 'fill-blanks', 'A bird can ___.', 'L3'],
  ['fill-hops', 'hops', '🐰', 'fill-blanks', 'The rabbit ___ to its home.', 'L3'],
  ['l3-soil', 'Soil', '🪴', 'reading', 'Mia puts the seed in the soil.', 'L3'],
  ['l3-water', 'Water', '💧', 'reading', 'Mia gives the seed water.', 'L3'],
  ['l3-sky', 'Sky', '🌤️', 'reading', 'The kite dances in the sky.', 'L3'],
  ['l3-kite', 'Kite', '🪁', 'reading', 'Max flies a red kite.', 'L3'],
  ['l3-pond', 'Pond', '🪷', 'reading', 'The fox walks to a pond.', 'L3'],
  ['l3-frog', 'Frog', '🐸', 'reading', 'The frog jumps into the water.', 'L3'],
  ['l3-rock', 'Rock', '🪨', 'reading', 'The frog sits on a rock.', 'L3'],
  ['l3-bird', 'Bird', '🐦', 'reading', 'The little bird can fly.', 'L3']
].map(([id, word, emoji, category, sentence, level]) => ({
  id, word, emoji, category, sentence, level
}));

export const vocabulary = [
  ...baseVocabulary,
  ...alphabet,
  ...levelOneNumbers,
  ...levelTwoNumbers,
  ...extraVocabulary
];

export const curriculumLessons = [
  { id: 'alphabet-adventure', level: 'L1', title: 'Alphabet Adventure', category: 'alphabet', description: 'Meet every letter from A to Z and its sound.', challenge: { prompt: 'Which letter comes after A?', options: [{ label: 'B', emoji: '🅱️', correct: true }, { label: 'C', emoji: '©️' }, { label: 'D', emoji: '🔠' }] } },
  { id: 'count-1-10', level: 'L1', title: 'Count 1 to 10', category: 'numbers', description: 'Say each number and count the stars.', challenge: { prompt: 'What comes after 5?', options: [{ label: '4', emoji: '4️⃣' }, { label: '6', emoji: '6️⃣', correct: true }, { label: '8', emoji: '8️⃣' }] } },
  { id: 'color-names', level: 'L1', title: 'Color Garden', category: 'colors', description: 'Name bright colors all around you.', challenge: { prompt: 'What color is a green leaf?', options: [{ label: 'Green', emoji: '💚', correct: true }, { label: 'Pink', emoji: '🩷' }, { label: 'Blue', emoji: '💙' }] } },
  { id: 'animal-names', level: 'L1', title: 'Animal Friends', category: 'animals', description: 'Meet animals and the sounds they make.', challenge: { prompt: 'Which animal can hop?', options: [{ label: 'Rabbit', emoji: '🐰', correct: true }, { label: 'Fish', emoji: '🐠' }, { label: 'Cow', emoji: '🐮' }] } },
  { id: 'fruit-names', level: 'L1', title: 'Fruit Basket', category: 'fruits', description: 'Discover fruit names, colors, and tastes.', challenge: { prompt: 'Which fruit is often long and yellow?', options: [{ label: 'Banana', emoji: '🍌', correct: true }, { label: 'Grapes', emoji: '🍇' }, { label: 'Pear', emoji: '🍐' }] } },
  { id: 'build-words', level: 'L2', title: 'Build a Word', category: 'word-building', description: 'Blend letter sounds to make small words.', challenge: { prompt: 'Which sounds make sun?', options: [{ label: 's-u-n', emoji: '☀️', correct: true }, { label: 'm-a-p', emoji: '🗺️' }, { label: 'c-a-t', emoji: '🐱' }] } },
  { id: 'make-sentences', level: 'L2', title: 'Little Sentences', category: 'sentences', description: 'Put words together to say a simple idea.', challenge: { prompt: 'Which one is a complete sentence?', options: [{ label: 'The dog can run.', emoji: '🐶', correct: true }, { label: 'dog the run', emoji: '🧩' }, { label: 'can the', emoji: '🔤' }] } },
  { id: 'count-1-100', level: 'L2', title: 'Number Trail to 100', category: 'numbers', description: 'Explore number names from 1 to 100.', challenge: { prompt: 'What comes after 29?', options: [{ label: '28', emoji: '🔢' }, { label: '30', emoji: '3️⃣0️⃣', correct: true }, { label: '40', emoji: '🔟' }] } },
  { id: 'read-stories', level: 'L3', title: 'Short Story Shelf', category: 'reading', description: 'Read a short story and think about what happened.', challenge: { prompt: 'In “Mia and the Seed,” where does Mia put the seed?', options: [{ label: 'In the soil', emoji: '🪴', correct: true }, { label: 'In the sky', emoji: '🌤️' }, { label: 'In a pond', emoji: '🪷' }] } },
  { id: 'build-a-sentence', level: 'L3', title: 'Sentence Builder', category: 'sentence-builder', description: 'Put words in order to make a sentence.', challenge: { prompt: 'Which sentence sounds right?', options: [{ label: 'The little bird can fly.', emoji: '🐦', correct: true }, { label: 'Bird little the fly can.', emoji: '🧩' }, { label: 'Fly can bird the little.', emoji: '🔤' }] } },
  { id: 'fill-the-gap', level: 'L3', title: 'Fill in the Blank', category: 'fill-blanks', description: 'Choose a word that makes the sentence complete.', challenge: { prompt: 'Fish can ___.', options: [{ label: 'swim', emoji: '🐟', correct: true }, { label: 'fly', emoji: '🪽' }, { label: 'read', emoji: '📖' }] } }
];

const quizQuestion = (id, level, category, question, answer, options, passage) => ({
  id, level, category, question, answer,
  ...(passage ? { passage } : {}),
  options: options.map(([label, emoji, itemId]) => ({ label, emoji, itemId }))
});

export const quizzes = [
  quizQuestion('l1-letter-sound', 'L1', 'alphabet', 'Which letter starts the word apple?', 'letter-a', [['A', '🍎', 'letter-a'], ['B', '⚽', 'letter-b'], ['C', '🐱', 'letter-c']]),
  quizQuestion('l1-next-number', 'L1', 'numbers', 'What comes after 4?', 'number-five', [['3', '3️⃣', 'three'], ['5', '5️⃣', 'number-five'], ['7', '7️⃣', 'number-seven']]),
  quizQuestion('l1-color', 'L1', 'colors', 'What color is the grass?', 'green', [['Blue', '💙', 'blue'], ['Green', '💚', 'green'], ['Red', '❤️', 'red']]),
  quizQuestion('l1-animal-sound', 'L1', 'animals', 'Which animal says “woof”?', 'dog', [['Cat', '🐱', 'cat'], ['Dog', '🐶', 'dog'], ['Duck', '🦆', 'duck']]),
  quizQuestion('l1-fruit', 'L1', 'fruits', 'Which fruit is long and yellow?', 'banana', [['Pear', '🍐', 'pear'], ['Banana', '🍌', 'banana'], ['Apple', '🍎', 'apple']]),
  quizQuestion('l1-counting', 'L1', 'numbers', 'What comes after 8?', 'number-nine', [['6', '6️⃣', 'number-six'], ['9', '9️⃣', 'number-nine'], ['10', '🔟', 'number-ten']]),
  quizQuestion('l1-alphabet-order', 'L1', 'alphabet', 'Which letter comes after M?', 'letter-n', [['L', '🔤', 'letter-l'], ['N', '🔤', 'letter-n'], ['P', '🔤', 'letter-p']]),
  quizQuestion('l1-sky-color', 'L1', 'colors', 'What color is a clear daytime sky?', 'blue', [['Blue', '💙', 'blue'], ['Brown', '🟤', 'brown'], ['Pink', '🩷', 'pink']]),
  quizQuestion('l1-animal-movement', 'L1', 'animals', 'Which animal can hop?', 'rabbit', [['Rabbit', '🐰', 'rabbit'], ['Fish', '🐠', 'fish'], ['Elephant', '🐘', 'elephant']]),
  quizQuestion('l1-fruit-name', 'L1', 'fruits', 'Which one is a fruit?', 'grapes', [['Grapes', '🍇', 'grapes'], ['Lion', '🦁', 'lion'], ['Purple', '💜', 'purple']]),
  quizQuestion('l2-blend-cat', 'L2', 'word-building', 'Which sounds make the word cat?', 'make-cat', [['c-a-t', '🐱', 'make-cat'], ['s-u-n', '☀️', 'make-sun'], ['m-a-p', '🗺️', 'make-map']]),
  quizQuestion('l2-blend-sun', 'L2', 'word-building', 'Blend s-u-n. What word do you hear?', 'make-sun', [['Map', '🗺️', 'make-map'], ['Sun', '☀️', 'make-sun'], ['Cat', '🐱', 'make-cat']]),
  quizQuestion('l2-sentence-one', 'L2', 'sentences', 'Which is a complete sentence?', 'sentence-bird', [['I see the bird.', '🐦', 'sentence-bird'], ['See bird the.', '🧩', 'sentence-scrambled'], ['Bird I.', '🔤', 'sentence-fragment']]),
  quizQuestion('l2-next-30', 'L2', 'numbers', 'What number comes after 29?', 'number-l2-30', [['28', '🔢', 'number-l2-28'], ['30', '🔢', 'number-l2-30'], ['40', '🔢', 'number-l2-40']]),
  quizQuestion('l2-number-50', 'L2', 'numbers', 'Find the number fifty.', 'number-l2-50', [['15', '🔢', 'number-l2-15'], ['50', '🔢', 'number-l2-50'], ['5', '🔢', 'number-l2-5']]),
  quizQuestion('l2-count-100', 'L2', 'numbers', 'Which number comes just before 100?', 'number-l2-99', [['90', '🔢', 'number-l2-90'], ['99', '🔢', 'number-l2-99'], ['10', '🔢', 'number-l2-10']]),
  quizQuestion('l2-word-map', 'L2', 'word-building', 'Which letters make the word map?', 'make-map', [['m-a-p', '🗺️', 'make-map'], ['c-a-t', '🐱', 'make-cat'], ['s-u-n', '☀️', 'make-sun']]),
  quizQuestion('l2-sentence-two', 'L2', 'sentences', 'Choose a sentence that tells what a dog can do.', 'sentence-dog', [['The dog can run.', '🐶', 'sentence-dog'], ['Dog run can the.', '🧩', 'sentence-scrambled'], ['Run dog.', '🔤', 'sentence-fragment']]),
  quizQuestion('l2-number-42', 'L2', 'numbers', 'Which number is forty-two?', 'number-l2-42', [['24', '🔢', 'number-l2-24'], ['42', '🔢', 'number-l2-42'], ['40', '🔢', 'number-l2-40']]),
  quizQuestion('l2-word-sounds', 'L2', 'word-building', 'What word do the sounds m-a-p make?', 'make-map', [['Map', '🗺️', 'make-map'], ['Sun', '☀️', 'make-sun'], ['Cat', '🐱', 'make-cat']]),
  quizQuestion('l3-story-seed', 'L3', 'reading', 'Where does Mia put the seed?', 'l3-soil', [['In the soil', '🪴', 'l3-soil'], ['In the sky', '🌤️', 'l3-sky'], ['On a rock', '🪨', 'l3-rock']], 'Mia finds a little seed. She puts it in the soil and gives it water. The sun shines. Soon, a green plant grows.'),
  quizQuestion('l3-story-water', 'L3', 'reading', 'What does Mia give the seed?', 'l3-water', [['A kite', '🪁', 'l3-kite'], ['Water', '💧', 'l3-water'], ['A rock', '🪨', 'l3-rock']], 'Mia finds a little seed. She puts it in the soil and gives it water. The sun shines. Soon, a green plant grows.'),
  quizQuestion('l3-story-kite', 'L3', 'reading', 'What does Max fly?', 'l3-kite', [['A red kite', '🪁', 'l3-kite'], ['A frog', '🐸', 'l3-frog'], ['A bird', '🐦', 'l3-bird']], 'Max has a red kite. The wind blows softly. Up, up goes the kite! Max runs across the grass.'),
  quizQuestion('l3-story-sky', 'L3', 'reading', 'Where does the kite dance?', 'l3-sky', [['In the pond', '🪷', 'l3-pond'], ['In the sky', '🌤️', 'l3-sky'], ['On a rock', '🪨', 'l3-rock']], 'Max has a red kite. The wind blows softly. Up, up goes the kite! Max runs across the grass.'),
  quizQuestion('l3-story-fox', 'L3', 'reading', 'Which animal visits the pond?', 'story-fox', [['A fox', '🦊', 'story-fox'], ['A kite', '🪁', 'l3-kite'], ['A seed', '🌱', 'story-mia']], 'A small fox walks to a pond. It sees a frog on a rock. The frog jumps into the water. Splash!'),
  quizQuestion('l3-story-frog', 'L3', 'reading', 'Where does the frog sit?', 'l3-rock', [['On a rock', '🪨', 'l3-rock'], ['In a tree', '🌳', 'story-fox'], ['On a kite', '🪁', 'l3-kite']], 'A small fox walks to a pond. It sees a frog on a rock. The frog jumps into the water. Splash!'),
  quizQuestion('l3-fill-sun', 'L3', 'fill-blanks', 'The sun is ___.', 'fill-bright', [['bright', '☀️', 'fill-bright'], ['swim', '🐟', 'fill-swim'], ['hops', '🐰', 'fill-hops']]),
  quizQuestion('l3-fill-fish', 'L3', 'fill-blanks', 'Fish can ___.', 'fill-swim', [['fly', '🪽', 'fill-fly'], ['swim', '🐟', 'fill-swim'], ['hop', '🐰', 'fill-hops']]),
  quizQuestion('l3-fill-rabbit', 'L3', 'fill-blanks', 'The rabbit ___ to its home.', 'fill-hops', [['hops', '🐰', 'fill-hops'], ['swims', '🐟', 'fill-swim'], ['shines', '☀️', 'fill-bright']]),
  quizQuestion('l3-sentence-order', 'L3', 'sentence-builder', 'Which sentence has the words in the right order?', 'sentence-builder-right', [['The little bird can fly.', '🐦', 'sentence-builder-right'], ['Bird little the fly can.', '🧩', 'sentence-builder-wrong'], ['Fly can bird the little.', '🔤', 'sentence-builder-reversed']])
];

export function getTutorCurriculumContext({ level, topic, lessonId, itemId, message }) {
  const activeLevel = ['L1', 'L2', 'L3'].includes(level) ? level : 'L1';
  const activeLesson = curriculumLessons.find(lesson => lesson.id === lessonId && lesson.level === activeLevel);
  const activeItem = vocabulary.find(item => item.id === itemId && item.level === activeLevel);
  const category = activeLesson?.category || (typeof topic === 'string' ? topic : '');
  const normalizedMessage = String(message || '').toLowerCase();
  const topicTokens = normalizedMessage.match(/[a-z0-9]+/g) || [];
  const stopWords = new Set(['about', 'after', 'again', 'because', 'before', 'could', 'does', 'every', 'from', 'have', 'help', 'into', 'just', 'little', 'please', 'really', 'should', 'something', 'tell', 'that', 'them', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);
  const keywords = new Set(topicTokens.filter(token => token.length > 2 && !stopWords.has(token)));
  const levelItems = vocabulary.filter(item => item.level === activeLevel);
  const matchedItems = levelItems.filter(item => {
    const searchable = `${item.word} ${item.sentence} ${item.category}`.toLowerCase();
    return [...keywords].some(keyword => searchable.includes(keyword));
  });
  const topicItems = category
    ? levelItems.filter(item => item.category === category)
    : [];
  const focusItems = [...new Map([
    ...(activeItem ? [activeItem] : []),
    ...matchedItems,
    ...topicItems
  ].map(item => [item.id, item])).values()].slice(0, activeLesson?.category === 'alphabet' ? 26 : 12);
  const lessons = curriculumLessons
    .filter(lesson => lesson.level === activeLevel)
    .map(({ id, title, category: lessonCategory, description }) => ({ id, title, category: lessonCategory, description }));

  return {
    level: activeLevel,
    lessons,
    activeLesson: activeLesson ? {
      title: activeLesson.title,
      category: activeLesson.category,
      description: activeLesson.description,
      challenge: activeLesson.challenge?.prompt || null
    } : null,
    activeWord: activeItem ? {
      word: activeItem.word,
      category: activeItem.category,
      example: activeItem.sentence
    } : null,
    focusWords: focusItems.map(({ word, category: itemCategory, sentence }) => ({
      word,
      category: itemCategory,
      example: sentence
    }))
  };
}
