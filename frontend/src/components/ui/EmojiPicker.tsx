import { useState, useRef, useEffect } from 'react';
import './EmojiPicker.css';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose?: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: { emoji: string; name: string }[];
}

const QUICK_REACTIONS = [
  { emoji: '👍', name: 'thumbs up' },
  { emoji: '❤️', name: 'red heart' },
  { emoji: '😂', name: 'face with tears of joy' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '🚀', name: 'rocket ship' },
  { emoji: '🎉', name: 'party popper' },
  { emoji: '👏', name: 'clapping hands' },
  { emoji: '😮', name: 'face with open mouth' },
];

// Universal, rock-solid Unicode <= 12 emojis guaranteed to render flawlessly across all Windows, Mac, and mobile browsers
const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: '😀',
    emojis: [
      { emoji: '😀', name: 'grinning face' },
      { emoji: '😃', name: 'grinning face with big eyes' },
      { emoji: '😄', name: 'grinning face with smiling eyes' },
      { emoji: '😁', name: 'beaming face' },
      { emoji: '😆', name: 'grinning squinting face' },
      { emoji: '😅', name: 'grinning face with sweat' },
      { emoji: '🤣', name: 'rolling on the floor laughing' },
      { emoji: '😂', name: 'face with tears of joy' },
      { emoji: '🙂', name: 'slightly smiling face' },
      { emoji: '🙃', name: 'upside down face' },
      { emoji: '😉', name: 'winking face' },
      { emoji: '😊', name: 'smiling face with smiling eyes' },
      { emoji: '😇', name: 'smiling face with halo' },
      { emoji: '🥰', name: 'smiling face with hearts' },
      { emoji: '😍', name: 'smiling face with heart eyes' },
      { emoji: '🤩', name: 'star struck' },
      { emoji: '😘', name: 'face blowing a kiss' },
      { emoji: '😗', name: 'kissing face' },
      { emoji: '😚', name: 'kissing face with closed eyes' },
      { emoji: '😋', name: 'face savoring food' },
      { emoji: '😛', name: 'face with tongue' },
      { emoji: '😜', name: 'winking face with tongue' },
      { emoji: '🤪', name: 'zany face' },
      { emoji: '😝', name: 'squinting face with tongue' },
      { emoji: '🤑', name: 'money mouth face' },
      { emoji: '🤗', name: 'smiling face with open hands' },
      { emoji: '🤭', name: 'face with hand over mouth' },
      { emoji: '🤫', name: 'shushing face' },
      { emoji: '🤔', name: 'thinking face' },
      { emoji: '🤐', name: 'zipper mouth face' },
      { emoji: '🤨', name: 'face with raised eyebrow' },
      { emoji: '😐', name: 'neutral face' },
      { emoji: '😑', name: 'expressionless face' },
      { emoji: '😶', name: 'face without mouth' },
      { emoji: '😏', name: 'smirking face' },
      { emoji: '😒', name: 'unamused face' },
      { emoji: '🙄', name: 'face with rolling eyes' },
      { emoji: '😬', name: 'grimacing face' },
      { emoji: '🤥', name: 'lying face' },
      { emoji: '😌', name: 'relieved face' },
      { emoji: '😔', name: 'pensive face' },
      { emoji: '😪', name: 'sleepy face' },
      { emoji: '🤤', name: 'drooling face' },
      { emoji: '😴', name: 'sleeping face' },
      { emoji: '😷', name: 'face with medical mask' },
      { emoji: '🤒', name: 'face with thermometer' },
      { emoji: '🤕', name: 'face with head bandage' },
      { emoji: '🤢', name: 'nauseated face' },
      { emoji: '🤮', name: 'face vomiting' },
      { emoji: '🤧', name: 'sneezing face' },
      { emoji: '🥵', name: 'hot face' },
      { emoji: '🥶', name: 'cold face' },
      { emoji: '🥴', name: 'woozy face' },
      { emoji: '😵', name: 'dizzy face' },
      { emoji: '🤯', name: 'exploding head' },
      { emoji: '🤠', name: 'cowboy hat face' },
      { emoji: '🥳', name: 'partying face' },
      { emoji: '😎', name: 'smiling face with sunglasses' },
      { emoji: '🤓', name: 'nerd face' },
      { emoji: '🧐', name: 'face with monocle' },
      { emoji: '😕', name: 'confused face' },
      { emoji: '😟', name: 'worried face' },
      { emoji: '🙁', name: 'slightly frowning face' },
      { emoji: '😮', name: 'face with open mouth' },
      { emoji: '😯', name: 'hushed face' },
      { emoji: '😲', name: 'astonished face' },
      { emoji: '😳', name: 'flushed face' },
      { emoji: '🥺', name: 'pleading face' },
      { emoji: '😦', name: 'frowning face with open mouth' },
      { emoji: '😧', name: 'anguished face' },
      { emoji: '😨', name: 'fearful face' },
      { emoji: '😰', name: 'anxious face with sweat' },
      { emoji: '😥', name: 'sad but relieved face' },
      { emoji: '😢', name: 'crying face' },
      { emoji: '😭', name: 'loudly crying face' },
      { emoji: '😱', name: 'face screaming in fear' },
      { emoji: '😖', name: 'confounded face' },
      { emoji: '😣', name: 'persevering face' },
      { emoji: '😞', name: 'disappointed face' },
      { emoji: '😓', name: 'downcast face with sweat' },
      { emoji: '😩', name: 'weary face' },
      { emoji: '😫', name: 'tired face' },
      { emoji: '🥱', name: 'yawning face' },
      { emoji: '😤', name: 'face with steam from nose' },
      { emoji: '😡', name: 'pouting face angry' },
      { emoji: '😠', name: 'angry face' },
      { emoji: '🤬', name: 'face with symbols on mouth' },
      { emoji: '💀', name: 'skull' },
      { emoji: '☠️', name: 'skull and crossbones' },
      { emoji: '💩', name: 'pile of poo' },
      { emoji: '🤡', name: 'clown face' },
      { emoji: '👹', name: 'ogre' },
      { emoji: '👺', name: 'goblin' },
      { emoji: '👻', name: 'ghost' },
      { emoji: '👽', name: 'alien' },
      { emoji: '👾', name: 'alien monster' },
      { emoji: '🤖', name: 'robot' },
    ],
  },
  {
    id: 'people',
    name: 'Hands & Gestures',
    icon: '👋',
    emojis: [
      { emoji: '👋', name: 'waving hand' },
      { emoji: '🤚', name: 'raised back of hand' },
      { emoji: '🖐️', name: 'hand with fingers splayed' },
      { emoji: '✋', name: 'raised hand' },
      { emoji: '🖖', name: 'vulcan salute' },
      { emoji: '👌', name: 'OK hand' },
      { emoji: '🤏', name: 'pinching hand' },
      { emoji: '✌️', name: 'victory hand' },
      { emoji: '🤞', name: 'crossed fingers' },
      { emoji: '🤟', name: 'love you gesture' },
      { emoji: '🤘', name: 'sign of the horns' },
      { emoji: '🤙', name: 'call me hand' },
      { emoji: '👈', name: 'backhand index pointing left' },
      { emoji: '👉', name: 'backhand index pointing right' },
      { emoji: '👆', name: 'backhand index pointing up' },
      { emoji: '🖕', name: 'middle finger' },
      { emoji: '👇', name: 'backhand index pointing down' },
      { emoji: '☝️', name: 'index pointing up' },
      { emoji: '👍', name: 'thumbs up' },
      { emoji: '👎', name: 'thumbs down' },
      { emoji: '✊', name: 'raised fist' },
      { emoji: '👊', name: 'oncoming fist' },
      { emoji: '🤛', name: 'left facing fist' },
      { emoji: '🤜', name: 'right facing fist' },
      { emoji: '👏', name: 'clapping hands' },
      { emoji: '🙌', name: 'raising hands' },
      { emoji: '👐', name: 'open hands' },
      { emoji: '🤲', name: 'palms up together' },
      { emoji: '🤝', name: 'handshake' },
      { emoji: '🙏', name: 'folded hands pray' },
      { emoji: '✍️', name: 'writing hand' },
      { emoji: '💅', name: 'nail polish' },
      { emoji: '🤳', name: 'selfie' },
      { emoji: '💪', name: 'flexed biceps' },
      { emoji: '🧠', name: 'brain' },
      { emoji: '👀', name: 'eyes' },
      { emoji: '👁️', name: 'eye' },
    ],
  },
  {
    id: 'nature',
    name: 'Animals & Nature',
    icon: '🐱',
    emojis: [
      { emoji: '🐶', name: 'dog face' },
      { emoji: '🐱', name: 'cat face' },
      { emoji: '🐭', name: 'mouse face' },
      { emoji: '🐹', name: 'hamster face' },
      { emoji: '🐰', name: 'rabbit face' },
      { emoji: '🦊', name: 'fox' },
      { emoji: '🐻', name: 'bear' },
      { emoji: '🐼', name: 'panda' },
      { emoji: '🐨', name: 'koala' },
      { emoji: '🐯', name: 'tiger face' },
      { emoji: '🦁', name: 'lion' },
      { emoji: '🐮', name: 'cow face' },
      { emoji: '🐷', name: 'pig face' },
      { emoji: '🐸', name: 'frog' },
      { emoji: '🐵', name: 'monkey face' },
      { emoji: '🙈', name: 'see no evil monkey' },
      { emoji: '🙉', name: 'hear no evil monkey' },
      { emoji: '🙊', name: 'speak no evil monkey' },
      { emoji: '🐔', name: 'chicken' },
      { emoji: '🐧', name: 'penguin' },
      { emoji: '🐦', name: 'bird' },
      { emoji: '🐤', name: 'baby chick' },
      { emoji: '🦆', name: 'duck' },
      { emoji: '🦅', name: 'eagle' },
      { emoji: '🦉', name: 'owl' },
      { emoji: '🦇', name: 'bat' },
      { emoji: '🐺', name: 'wolf' },
      { emoji: '🐗', name: 'boar' },
      { emoji: '🐴', name: 'horse face' },
      { emoji: '🦄', name: 'unicorn' },
      { emoji: '🐝', name: 'honeybee' },
      { emoji: '🐛', name: 'bug' },
      { emoji: '🦋', name: 'butterfly' },
      { emoji: '🐌', name: 'snail' },
      { emoji: '🐞', name: 'lady beetle' },
      { emoji: '🐜', name: 'ant' },
      { emoji: '🦟', name: 'mosquito' },
      { emoji: '🦗', name: 'cricket' },
      { emoji: '🕷️', name: 'spider' },
      { emoji: '🦂', name: 'scorpion' },
      { emoji: '🐢', name: 'turtle' },
      { emoji: '🐍', name: 'snake' },
      { emoji: '🦎', name: 'lizard' },
      { emoji: '🦖', name: 't-rex' },
      { emoji: '🦕', name: 'sauropod' },
      { emoji: '🐙', name: 'octopus' },
      { emoji: '🦑', name: 'squid' },
      { emoji: '🦐', name: 'shrimp' },
      { emoji: '🦞', name: 'lobster' },
      { emoji: '🦀', name: 'crab' },
      { emoji: '🐡', name: 'blowfish' },
      { emoji: '🐠', name: 'tropical fish' },
      { emoji: '🐟', name: 'fish' },
      { emoji: '🐬', name: 'dolphin' },
      { emoji: '🐳', name: 'spouting whale' },
      { emoji: '🐋', name: 'whale' },
      { emoji: '🦈', name: 'shark' },
      { emoji: '🐊', name: 'crocodile' },
      { emoji: '🐅', name: 'tiger' },
      { emoji: '🐆', name: 'leopard' },
      { emoji: '🦓', name: 'zebra' },
      { emoji: '🦍', name: 'gorilla' },
      { emoji: '🐘', name: 'elephant' },
      { emoji: '🦛', name: 'hippopotamus' },
      { emoji: '🦏', name: 'rhinoceros' },
      { emoji: '🐪', name: 'camel' },
      { emoji: '🦒', name: 'giraffe' },
      { emoji: '🦘', name: 'kangaroo' },
      { emoji: '🐕', name: 'dog' },
      { emoji: '🐈', name: 'cat' },
      { emoji: '🦚', name: 'peacock' },
      { emoji: '🦜', name: 'parrot' },
      { emoji: '🕊️', name: 'dove' },
      { emoji: '🐇', name: 'rabbit' },
      { emoji: '🦝', name: 'raccoon' },
      { emoji: '🌵', name: 'cactus' },
      { emoji: '🎄', name: 'christmas tree' },
      { emoji: '🌲', name: 'evergreen tree' },
      { emoji: '🌳', name: 'deciduous tree' },
      { emoji: '🌴', name: 'palm tree' },
      { emoji: '🌱', name: 'seedling' },
      { emoji: '🌿', name: 'herb' },
      { emoji: '☘️', name: 'shamrock' },
      { emoji: '🍀', name: 'four leaf clover' },
      { emoji: '🍃', name: 'leaf fluttering in wind' },
      { emoji: '🍂', name: 'fallen leaf' },
      { emoji: '🍁', name: 'maple leaf' },
      { emoji: '🍄', name: 'mushroom' },
      { emoji: '💐', name: 'bouquet' },
      { emoji: '🌷', name: 'tulip' },
      { emoji: '🌹', name: 'rose' },
      { emoji: '🥀', name: 'wilted flower' },
      { emoji: '🌺', name: 'hibiscus' },
      { emoji: '🌸', name: 'cherry blossom' },
      { emoji: '🌻', name: 'sunflower' },
      { emoji: '🌞', name: 'sun with face' },
      { emoji: '🌙', name: 'crescent moon' },
      { emoji: '⭐', name: 'star' },
      { emoji: '🌟', name: 'glowing star' },
      { emoji: '✨', name: 'sparkles' },
      { emoji: '⚡', name: 'high voltage lightning' },
      { emoji: '💥', name: 'collision' },
      { emoji: '🔥', name: 'fire' },
      { emoji: '🌈', name: 'rainbow' },
      { emoji: '☀️', name: 'sun' },
      { emoji: '⛅', name: 'sun behind cloud' },
      { emoji: '☁️', name: 'cloud' },
      { emoji: '🌧️', name: 'cloud with rain' },
      { emoji: '⛈️', name: 'cloud with lightning and rain' },
      { emoji: '❄️', name: 'snowflake' },
      { emoji: '☃️', name: 'snowman' },
      { emoji: '💧', name: 'droplet' },
      { emoji: '🌊', name: 'water wave' },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '🍔',
    emojis: [
      { emoji: '🍏', name: 'green apple' },
      { emoji: '🍎', name: 'red apple' },
      { emoji: '🍐', name: 'pear' },
      { emoji: '🍊', name: 'tangerine orange' },
      { emoji: '🍋', name: 'lemon' },
      { emoji: '🍌', name: 'banana' },
      { emoji: '🍉', name: 'watermelon' },
      { emoji: '🍇', name: 'grapes' },
      { emoji: '🍓', name: 'strawberry' },
      { emoji: '🍈', name: 'melon' },
      { emoji: '🍒', name: 'cherries' },
      { emoji: '🍑', name: 'peach' },
      { emoji: '🥭', name: 'mango' },
      { emoji: '🍍', name: 'pineapple' },
      { emoji: '🥥', name: 'coconut' },
      { emoji: '🥝', name: 'kiwi fruit' },
      { emoji: '🍅', name: 'tomato' },
      { emoji: '🥑', name: 'avocado' },
      { emoji: '🥦', name: 'broccoli' },
      { emoji: '🥒', name: 'cucumber' },
      { emoji: '🌶️', name: 'hot pepper' },
      { emoji: '🌽', name: 'ear of corn' },
      { emoji: '🥕', name: 'carrot' },
      { emoji: '🥔', name: 'potato' },
      { emoji: '🥐', name: 'croissant' },
      { emoji: '🥯', name: 'bagel' },
      { emoji: '🍞', name: 'bread' },
      { emoji: '🥖', name: 'baguette bread' },
      { emoji: '🥨', name: 'pretzel' },
      { emoji: '🧀', name: 'cheese wedge' },
      { emoji: '🍳', name: 'cooking egg' },
      { emoji: '🥞', name: 'pancakes' },
      { emoji: '🧇', name: 'waffle' },
      { emoji: '🥓', name: 'bacon' },
      { emoji: '🥩', name: 'cut of meat' },
      { emoji: '🍗', name: 'poultry leg' },
      { emoji: '🍖', name: 'meat on bone' },
      { emoji: '🌭', name: 'hot dog' },
      { emoji: '🍔', name: 'hamburger' },
      { emoji: '🍟', name: 'french fries' },
      { emoji: '🍕', name: 'pizza' },
      { emoji: '🥪', name: 'sandwich' },
      { emoji: '🌮', name: 'taco' },
      { emoji: '🌯', name: 'burrito' },
      { emoji: '🥗', name: 'green salad' },
      { emoji: '🥘', name: 'shallow pan of food' },
      { emoji: '🍝', name: 'spaghetti' },
      { emoji: '🍜', name: 'steaming bowl ramen' },
      { emoji: '🍲', name: 'pot of food' },
      { emoji: '🍛', name: 'curry rice' },
      { emoji: '🍣', name: 'sushi' },
      { emoji: '🍱', name: 'bento box' },
      { emoji: '🥟', name: 'dumpling' },
      { emoji: '🍤', name: 'fried shrimp' },
      { emoji: '🍙', name: 'rice ball' },
      { emoji: '🍚', name: 'cooked rice' },
      { emoji: '🍦', name: 'soft ice cream' },
      { emoji: '🍧', name: 'shaved ice' },
      { emoji: '🍨', name: 'ice cream' },
      { emoji: '🍩', name: 'doughnut' },
      { emoji: '🍪', name: 'cookie' },
      { emoji: '🎂', name: 'birthday cake' },
      { emoji: '🍰', name: 'shortcake' },
      { emoji: '🧁', name: 'cupcake' },
      { emoji: '🥧', name: 'pie' },
      { emoji: '🍫', name: 'chocolate bar' },
      { emoji: '🍬', name: 'candy' },
      { emoji: '🍭', name: 'lollipop' },
      { emoji: '🍮', name: 'custard' },
      { emoji: '🍿', name: 'popcorn' },
      { emoji: '🥛', name: 'glass of milk' },
      { emoji: '☕', name: 'hot beverage coffee tea' },
      { emoji: '🍵', name: 'teacup without handle' },
      { emoji: '🧃', name: 'beverage box' },
      { emoji: '🥤', name: 'cup with straw' },
      { emoji: '🍺', name: 'beer mug' },
      { emoji: '🍻', name: 'clinking beer mugs' },
      { emoji: '🥂', name: 'clinking glasses' },
      { emoji: '🍷', name: 'wine glass' },
      { emoji: '🥃', name: 'tumbler glass whiskey' },
      { emoji: '🍸', name: 'cocktail glass' },
      { emoji: '🍹', name: 'tropical drink' },
      { emoji: '🍾', name: 'bottle with popping cork' },
      { emoji: '🧊', name: 'ice cube' },
    ],
  },
  {
    id: 'activity',
    name: 'Activities & Sports',
    icon: '⚽',
    emojis: [
      { emoji: '⚽', name: 'soccer ball' },
      { emoji: '🏀', name: 'basketball' },
      { emoji: '🏈', name: 'american football' },
      { emoji: '⚾', name: 'baseball' },
      { emoji: '🥎', name: 'softball' },
      { emoji: '🎾', name: 'tennis' },
      { emoji: '🏐', name: 'volleyball' },
      { emoji: '🏉', name: 'rugby football' },
      { emoji: '🥏', name: 'flying disc' },
      { emoji: '🎱', name: 'pool 8 ball' },
      { emoji: '🏓', name: 'ping pong' },
      { emoji: '🏸', name: 'badminton' },
      { emoji: '🏒', name: 'ice hockey' },
      { emoji: '🏏', name: 'cricket game' },
      { emoji: '🥅', name: 'goal net' },
      { emoji: '⛳', name: 'flag in hole' },
      { emoji: '🏹', name: 'bow and arrow' },
      { emoji: '🎣', name: 'fishing pole' },
      { emoji: '🥊', name: 'boxing glove' },
      { emoji: '🥋', name: 'martial arts uniform' },
      { emoji: '🛹', name: 'skateboard' },
      { emoji: '🎿', name: 'skis' },
      { emoji: '🧘', name: 'person in lotus position' },
      { emoji: '🏄', name: 'person surfing' },
      { emoji: '🏊', name: 'person swimming' },
      { emoji: '🚴', name: 'person biking' },
      { emoji: '🏆', name: 'trophy winner' },
      { emoji: '🥇', name: '1st place medal' },
      { emoji: '🥈', name: '2nd place medal' },
      { emoji: '🥉', name: '3rd place medal' },
      { emoji: '🏅', name: 'sports medal' },
      { emoji: '🎖️', name: 'military medal' },
      { emoji: '🎗️', name: 'reminder ribbon' },
      { emoji: '🎟️', name: 'admission tickets' },
      { emoji: '🎫', name: 'ticket' },
      { emoji: '🎪', name: 'circus tent' },
      { emoji: '🤹', name: 'person juggling' },
      { emoji: '🎭', name: 'performing arts' },
      { emoji: '🎨', name: 'artist palette' },
      { emoji: '🎬', name: 'clapper board' },
      { emoji: '🎤', name: 'microphone' },
      { emoji: '🎧', name: 'headphone' },
      { emoji: '🎼', name: 'musical score' },
      { emoji: '🎹', name: 'musical keyboard' },
      { emoji: '🥁', name: 'drum' },
      { emoji: '🎷', name: 'saxophone' },
      { emoji: '🎺', name: 'trumpet' },
      { emoji: '🎸', name: 'guitar' },
      { emoji: '🎻', name: 'violin' },
      { emoji: '🎲', name: 'game die' },
      { emoji: '♟️', name: 'chess pawn' },
      { emoji: '🎯', name: 'bullseye direct hit' },
      { emoji: '🎳', name: 'bowling' },
      { emoji: '🎮', name: 'video game controller' },
      { emoji: '🎰', name: 'slot machine' },
      { emoji: '🧩', name: 'puzzle piece' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Objects',
    icon: '🚀',
    emojis: [
      { emoji: '🚗', name: 'automobile car' },
      { emoji: '🚕', name: 'taxi' },
      { emoji: '🚙', name: 'sport utility vehicle' },
      { emoji: '🚌', name: 'bus' },
      { emoji: '🏎️', name: 'racing car' },
      { emoji: '🚓', name: 'police car' },
      { emoji: '🚑', name: 'ambulance' },
      { emoji: '🚒', name: 'fire engine' },
      { emoji: '🚚', name: 'delivery truck' },
      { emoji: '🚜', name: 'tractor' },
      { emoji: '🏍️', name: 'motorcycle' },
      { emoji: '🛵', name: 'motor scooter' },
      { emoji: '🚲', name: 'bicycle' },
      { emoji: '🚨', name: 'police car light' },
      { emoji: '🏢', name: 'office building' },
      { emoji: '🏥', name: 'hospital' },
      { emoji: '🏦', name: 'bank' },
      { emoji: '🏨', name: 'hotel' },
      { emoji: '🏫', name: 'school' },
      { emoji: '🏭', name: 'factory' },
      { emoji: '🏰', name: 'castle' },
      { emoji: '🚀', name: 'rocket ship' },
      { emoji: '🛸', name: 'flying saucer ufo' },
      { emoji: '🚁', name: 'helicopter' },
      { emoji: '🛶', name: 'canoe' },
      { emoji: '⛵', name: 'sailboat' },
      { emoji: '🚤', name: 'speedboat' },
      { emoji: '🛳️', name: 'passenger ship' },
      { emoji: '⚙️', name: 'gear' },
      { emoji: '🔑', name: 'key' },
      { emoji: '🔨', name: 'hammer' },
      { emoji: '🛠️', name: 'hammer and wrench' },
      { emoji: '🔧', name: 'wrench' },
      { emoji: '⛏️', name: 'pick' },
      { emoji: '💡', name: 'light bulb idea' },
      { emoji: '🔦', name: 'flashlight' },
      { emoji: '🕯️', name: 'candle' },
      { emoji: '🔌', name: 'electric plug' },
      { emoji: '💻', name: 'laptop computer' },
      { emoji: '🖥️', name: 'desktop computer' },
      { emoji: '🖨️', name: 'printer' },
      { emoji: '⌨️', name: 'keyboard' },
      { emoji: '🖱️', name: 'computer mouse' },
      { emoji: '📱', name: 'mobile phone' },
      { emoji: '📲', name: 'mobile phone with arrow' },
      { emoji: '☎️', name: 'telephone' },
      { emoji: '📷', name: 'camera' },
      { emoji: '📸', name: 'camera with flash' },
      { emoji: '📹', name: 'video camera' },
      { emoji: '🎥', name: 'movie camera' },
      { emoji: '📺', name: 'television' },
      { emoji: '📻', name: 'radio' },
      { emoji: '⏰', name: 'alarm clock' },
      { emoji: '⏱️', name: 'stopwatch' },
      { emoji: '⌛', name: 'hourglass done' },
      { emoji: '⏳', name: 'hourglass not done' },
      { emoji: '📡', name: 'satellite antenna' },
      { emoji: '🔋', name: 'battery' },
      { emoji: '💎', name: 'gem stone diamond' },
      { emoji: '⚖️', name: 'balance scale' },
      { emoji: '🧲', name: 'magnet' },
      { emoji: '💣', name: 'bomb' },
      { emoji: '🔪', name: 'kitchen knife' },
      { emoji: '⚔️', name: 'crossed swords' },
      { emoji: '🛡️', name: 'shield protection' },
      { emoji: '🔮', name: 'crystal ball' },
      { emoji: '💊', name: 'pill capsule' },
      { emoji: '💉', name: 'syringe' },
      { emoji: '🩺', name: 'stethoscope' },
      { emoji: '📦', name: 'package' },
      { emoji: '🏷️', name: 'label' },
      { emoji: '✉️', name: 'envelope email' },
      { emoji: '📩', name: 'envelope with arrow' },
      { emoji: '📊', name: 'bar chart' },
      { emoji: '📈', name: 'chart increasing' },
      { emoji: '📉', name: 'chart decreasing' },
      { emoji: '📋', name: 'clipboard' },
      { emoji: '📁', name: 'file folder' },
      { emoji: '📂', name: 'open file folder' },
      { emoji: '📜', name: 'scroll paper' },
      { emoji: '📄', name: 'page facing up' },
      { emoji: '📰', name: 'newspaper' },
      { emoji: '📖', name: 'open book' },
      { emoji: '🔗', name: 'link' },
      { emoji: '📎', name: 'paperclip' },
      { emoji: '📌', name: 'pushpin' },
      { emoji: '📍', name: 'round pushpin' },
      { emoji: '✂️', name: 'scissors' },
      { emoji: '🖊️', name: 'pen' },
      { emoji: '📝', name: 'memo text' },
      { emoji: '✏️', name: 'pencil' },
      { emoji: '🔍', name: 'magnifying glass left' },
      { emoji: '🔎', name: 'magnifying glass right' },
      { emoji: '🔒', name: 'locked' },
      { emoji: '🔓', name: 'unlocked' },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols & Flags',
    icon: '❤️',
    emojis: [
      { emoji: '❤️', name: 'red heart' },
      { emoji: '🧡', name: 'orange heart' },
      { emoji: '💛', name: 'yellow heart' },
      { emoji: '💚', name: 'green heart' },
      { emoji: '💙', name: 'blue heart' },
      { emoji: '💜', name: 'purple heart' },
      { emoji: '🖤', name: 'black heart' },
      { emoji: '🤍', name: 'white heart' },
      { emoji: '🤎', name: 'brown heart' },
      { emoji: '💔', name: 'broken heart' },
      { emoji: '❣️', name: 'heart exclamation' },
      { emoji: '💕', name: 'two hearts' },
      { emoji: '💞', name: 'revolving hearts' },
      { emoji: '💓', name: 'beating heart' },
      { emoji: '💗', name: 'growing heart' },
      { emoji: '💖', name: 'sparkles heart' },
      { emoji: '💘', name: 'heart with arrow' },
      { emoji: '💝', name: 'heart with ribbon' },
      { emoji: '💯', name: 'hundred points' },
      { emoji: '💢', name: 'anger symbol' },
      { emoji: '💬', name: 'speech balloon chat' },
      { emoji: '🗯️', name: 'right anger bubble' },
      { emoji: '💭', name: 'thought bubble' },
      { emoji: '♨️', name: 'hot springs' },
      { emoji: '💮', name: 'white flower' },
      { emoji: '🉐', name: 'japanese bargain button' },
      { emoji: '🅰️', name: 'A button red' },
      { emoji: '🅱️', name: 'B button red' },
      { emoji: '🆎', name: 'AB button red' },
      { emoji: '🅾️', name: 'O button red' },
      { emoji: '🆘', name: 'SOS button' },
      { emoji: '❌', name: 'cross mark cancel' },
      { emoji: '⭕', name: 'hollow red circle' },
      { emoji: '🛑', name: 'stop sign' },
      { emoji: '⛔', name: 'no entry' },
      { emoji: '📛', name: 'name badge' },
      { emoji: '🚫', name: 'prohibited' },
      { emoji: '❗', name: 'exclamation mark' },
      { emoji: '❓', name: 'question mark' },
      { emoji: '‼️', name: 'double exclamation mark' },
      { emoji: '⁉️', name: 'exclamation question mark' },
      { emoji: '⚠️', name: 'warning sign' },
      { emoji: '🔱', name: 'trident emblem' },
      { emoji: '❇️', name: 'sparkle green' },
      { emoji: '✳️', name: 'eight spoked asterisk' },
      { emoji: '❎', name: 'cross mark button' },
      { emoji: '✅', name: 'check mark checkmark done success' },
      { emoji: '🌐', name: 'globe with meridians' },
      { emoji: '💠', name: 'diamond with a dot' },
      { emoji: 'Ⓜ️', name: 'circled M' },
      { emoji: '💤', name: 'zzz sleep' },
      { emoji: '🏧', name: 'ATM sign' },
      { emoji: '♿', name: 'wheelchair symbol' },
      { emoji: '🅿️', name: 'P button parking' },
      { emoji: 'ℹ️', name: 'information' },
      { emoji: '🆗', name: 'OK button' },
      { emoji: '🆕', name: 'NEW button' },
      { emoji: '🆖', name: 'NG button' },
      { emoji: '🆙', name: 'UP button' },
      { emoji: '🆒', name: 'COOL button' },
      { emoji: '0️⃣', name: 'keycap 0' },
      { emoji: '1️⃣', name: 'keycap 1' },
      { emoji: '2️⃣', name: 'keycap 2' },
      { emoji: '3️⃣', name: 'keycap 3' },
      { emoji: '4️⃣', name: 'keycap 4' },
      { emoji: '5️⃣', name: 'keycap 5' },
      { emoji: '6️⃣', name: 'keycap 6' },
      { emoji: '7️⃣', name: 'keycap 7' },
      { emoji: '8️⃣', name: 'keycap 8' },
      { emoji: '9️⃣', name: 'keycap 9' },
      { emoji: '🔟', name: 'keycap 10' },
      { emoji: '▶️', name: 'play button' },
      { emoji: '⏸️', name: 'pause button' },
      { emoji: '⏹️', name: 'stop button' },
      { emoji: '⏺️', name: 'record button' },
      { emoji: '⏭️', name: 'next track' },
      { emoji: '⏮️', name: 'previous track' },
      { emoji: '⏩', name: 'fast forward' },
      { emoji: '⏪', name: 'fast reverse' },
      { emoji: '🔀', name: 'shuffle tracks' },
      { emoji: '🔁', name: 'repeat button' },
      { emoji: '◀️', name: 'reverse button' },
      { emoji: '🔼', name: 'upward button' },
      { emoji: '🔽', name: 'downward button' },
      { emoji: '🔺', name: 'red triangle pointed up' },
      { emoji: '🔻', name: 'red triangle pointed down' },
      { emoji: '📣', name: 'megaphone' },
      { emoji: '📢', name: 'loudspeaker' },
      { emoji: '🔔', name: 'bell notification' },
      { emoji: '🔕', name: 'bell with slash' },
      { emoji: '🎵', name: 'musical note' },
      { emoji: '🎶', name: 'musical notes' },
      { emoji: '🏁', name: 'chequered flag finish' },
      { emoji: '🚩', name: 'triangular flag' },
      { emoji: '🎌', name: 'crossed flags' },
      { emoji: '🏴', name: 'black flag' },
      { emoji: '🏳️', name: 'white flag' },
    ],
  },
];

export function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredEmoji, setHoveredEmoji] = useState<{ emoji: string; name: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Filter emojis by search query or display active category
  const displayedCategories = searchQuery.trim()
    ? EMOJI_CATEGORIES.map((cat) => ({
        ...cat,
        emojis: cat.emojis.filter(
          (item) =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
            item.emoji.includes(searchQuery.trim())
        ),
      })).filter((cat) => cat.emojis.length > 0)
    : EMOJI_CATEGORIES.filter((cat) => cat.id === activeCategory);

  return (
    <div className="emoji-picker-container" ref={pickerRef} tabIndex={-1}>
      {/* Search Header */}
      <div className="emoji-picker__search-wrapper">
        <svg
          className="emoji-picker__search-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          className="emoji-picker__search-input"
          placeholder="Search emojis..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus={false}
        />
        {searchQuery && (
          <button
            type="button"
            className="emoji-picker__search-clear"
            onClick={() => {
              setSearchQuery('');
              searchInputRef.current?.focus();
            }}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Quick Reactions Strip (Only in default view) */}
      {!searchQuery && (
        <div className="emoji-picker__quick-reactions">
          <span className="emoji-picker__quick-label">QUICK</span>
          <div className="emoji-picker__quick-list">
            {QUICK_REACTIONS.map((item) => (
              <button
                key={`quick-${item.emoji}`}
                type="button"
                className="emoji-picker__quick-btn"
                onClick={() => {
                  onSelectEmoji(item.emoji);
                  onClose?.();
                }}
                onMouseEnter={() => setHoveredEmoji(item)}
                onMouseLeave={() => setHoveredEmoji(null)}
                title={`:${item.name}:`}
              >
                {item.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Tabs */}
      {!searchQuery && (
        <div className="emoji-picker__tabs">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`emoji-picker__tab ${activeCategory === cat.id ? 'emoji-picker__tab--active' : ''}`}
              onClick={() => {
                setActiveCategory(cat.id);
                const container = pickerRef.current?.querySelector('.emoji-picker__content');
                if (container) {
                  container.scrollTop = 0;
                }
              }}
              title={cat.name}
            >
              <span>{cat.icon}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji List Grid */}
      <div className="emoji-picker__content">
        {displayedCategories.length === 0 ? (
          <div className="emoji-picker__empty">
            <span className="emoji-picker__empty-icon">🔍</span>
            <p>No emojis found for "{searchQuery}"</p>
          </div>
        ) : (
          displayedCategories.map((cat) => (
            <div key={cat.id} className="emoji-picker__section">
              <h4 className="emoji-picker__section-title">{cat.name}</h4>
              <div className="emoji-picker__grid">
                {cat.emojis.map((item, idx) => (
                  <button
                    key={`${item.emoji}-${idx}`}
                    type="button"
                    className="emoji-picker__emoji-btn"
                    onClick={() => {
                      onSelectEmoji(item.emoji);
                      onClose?.();
                    }}
                    onMouseEnter={() => setHoveredEmoji(item)}
                    onMouseLeave={() => setHoveredEmoji(null)}
                    title={`:${item.name}:`}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Enterprise Interactive Preview Footer (Slack & Discord Style) */}
      <div className="emoji-picker__footer">
        {hoveredEmoji ? (
          <div className="emoji-picker__preview">
            <span className="emoji-picker__preview-glyph">{hoveredEmoji.emoji}</span>
            <div className="emoji-picker__preview-info">
              <span className="emoji-picker__preview-code">
                :{hoveredEmoji.name.replace(/\s+/g, '_')}:
              </span>
              <span className="emoji-picker__preview-name">{hoveredEmoji.name}</span>
            </div>
          </div>
        ) : (
          <div className="emoji-picker__footer-idle">
            <span className="emoji-picker__footer-icon">✨</span>
            <span>DevChat Emoji Reactions</span>
          </div>
        )}
      </div>
    </div>
  );
}
