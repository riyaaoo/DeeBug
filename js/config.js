/**
 * DeeBug — Game Configuration & Balance Constants
 * Pure data module (DOM-free) so it can be shared between client and future multiplayer server.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});

  const STORAGE_PREFIX = 'deebug_v1_';

  const WORLD = {
    width: 3400,
    height: 3400,
    borderPadding: 70,
    gridSize: 110,
    targetBugCount: 64,
    targetFoodCount: 120,
    minSpawnDistanceFromPlayer: 380,
    maxSpawnDistanceFromPlayer: 1450,
    decorCount: 140,
    obstacleCounts: {
      sanctuaries: 3,
      ponds: 7,
      trees: 16,
      rocks: 18,
    },
  };

  /**
   * Temporary status effects (5-10 seconds) granted by special garden food.
   */
  const EFFECTS = {
    bigger: {
      id: 'bigger',
      label: 'Giant Size',
      icon: '🌟',
      kind: 'buff',
      duration: 8,
      sizeMultiplier: 1.38,
      rankBonus: 1,
      color: '#ffbe55',
      bg: '#fff3cc',
    },
    invisible: {
      id: 'invisible',
      label: 'Invisible',
      icon: '👻',
      kind: 'buff',
      duration: 7.5,
      color: '#9c72e8',
      bg: '#f2e8ff',
    },
    stronger: {
      id: 'stronger',
      label: 'Super Strong',
      icon: '💪',
      kind: 'buff',
      duration: 8.5,
      rankBonus: 2,
      color: '#ff6f9c',
      bg: '#ffe5ee',
    },
    faster: {
      id: 'faster',
      label: 'Super Fast',
      icon: '⚡',
      kind: 'buff',
      duration: 7.5,
      speedMultiplier: 1.48,
      color: '#3aa6e8',
      bg: '#ddf2ff',
    },
    slower: {
      id: 'slower',
      label: 'Sticky Slow',
      icon: '🐌',
      kind: 'debuff',
      duration: 5.5,
      speedMultiplier: 0.62,
      color: '#9c59b6',
      bg: '#f4e3fb',
    },
    weaker: {
      id: 'weaker',
      label: 'Sleepy Weak',
      icon: '💤',
      kind: 'debuff',
      duration: 6,
      rankBonus: -1,
      color: '#7f6da8',
      bg: '#ece8fa',
    },
    smaller: {
      id: 'smaller',
      label: 'Tiny Bug',
      icon: '🔽',
      kind: 'debuff',
      duration: 6.5,
      sizeMultiplier: 0.72,
      rankBonus: -1,
      color: '#c46aa0',
      bg: '#fce6f4',
    },
  };

  /**
   * Non-bug garden food catalog: leaves, fruits, mushrooms, and berries.
   * Includes regular growth food and special glowing power/silly-effect treats.
   */
  const FOOD_TYPES = [
    // Regular growth foods (~78% weight total)
    {
      id: 'fresh_leaf',
      kind: 'leaf',
      name: 'Crisp Leaf',
      points: 7,
      radius: 12,
      weight: 22,
      color: '#95e6a8',
      accent: '#5bc277',
      effectId: null,
      special: false,
    },
    {
      id: 'sweet_berry',
      kind: 'berry',
      name: 'Sweet Berry',
      points: 9,
      radius: 11,
      weight: 22,
      color: '#ff8fab',
      accent: '#ff5d8f',
      effectId: null,
      special: false,
    },
    {
      id: 'peach_fruit',
      kind: 'fruit',
      name: 'Juicy Fruit',
      points: 12,
      radius: 13,
      weight: 18,
      color: '#ffc085',
      accent: '#ff9659',
      effectId: null,
      special: false,
    },
    {
      id: 'button_mushroom',
      kind: 'mushroom',
      name: 'Garden Mushroom',
      points: 10,
      radius: 12,
      weight: 16,
      color: '#f7d6b5',
      accent: '#d9a477',
      effectId: null,
      special: false,
    },

    // Positive power-up foods (5-10s temporary buffs)
    {
      id: 'mega_fruit',
      kind: 'fruit',
      name: 'Golden Mega Fruit',
      points: 14,
      radius: 15,
      weight: 4.5,
      color: '#ffe066',
      accent: '#ffab40',
      effectId: 'bigger',
      special: true,
    },
    {
      id: 'ghost_leaf',
      kind: 'leaf',
      name: 'Ghost Mist Leaf',
      points: 12,
      radius: 14,
      weight: 4.2,
      color: '#d9c2ff',
      accent: '#a78bfa',
      effectId: 'invisible',
      special: true,
    },
    {
      id: 'power_mushroom',
      kind: 'mushroom',
      name: 'Power Shroom',
      points: 14,
      radius: 15,
      weight: 4.5,
      color: '#ff9ebb',
      accent: '#ff5c8a',
      effectId: 'stronger',
      special: true,
    },
    {
      id: 'star_berry',
      kind: 'berry',
      name: 'Zippy Star Berry',
      points: 12,
      radius: 14,
      weight: 4.5,
      color: '#8ce0ff',
      accent: '#4dc4ff',
      effectId: 'faster',
      special: true,
    },

    // Playful debuff foods (5-7s temporary debuffs, still give bonus points!)
    {
      id: 'sticky_berry',
      kind: 'berry',
      name: 'Sticky Plum Berry',
      points: 11,
      radius: 13,
      weight: 2.3,
      color: '#c792ea',
      accent: '#8e44ad',
      effectId: 'slower',
      special: true,
    },
    {
      id: 'sleepy_leaf',
      kind: 'leaf',
      name: 'Sleepy Dusk Leaf',
      points: 11,
      radius: 13,
      weight: 2.2,
      color: '#b8b5ff',
      accent: '#6c63b5',
      effectId: 'weaker',
      special: true,
    },
    {
      id: 'shrink_mushroom',
      kind: 'mushroom',
      name: 'Shrink Toadstool',
      points: 11,
      radius: 13,
      weight: 2.3,
      color: '#e5a4d9',
      accent: '#a84c96',
      effectId: 'smaller',
      special: true,
    },
  ];

  /**
   * Rank progression (0 = tiny baby bugs for Lv.1 players to snack on; 1..10 = main ranks).
   * Player starts at Rank 1 and grows bigger with each rank up to Rank 10 (Pastel Monarch).
   */
  const RANKS = [
    {
      rank: 0,
      name: 'Dew Sprout',
      pointsRequired: 0,
      eatValue: 14,
      radius: 14,
      speed: 145,
      maxHp: 1,
      badgeBg: '#d8f5e3',
      badgeText: '#2c6e49',
      bodyColor: '#b8f2d0',
      accentColor: '#86dfb0',
    },
    {
      rank: 1,
      name: 'Baby Ladybug',
      pointsRequired: 0,
      eatValue: 22,
      radius: 21,
      speed: 225,
      maxHp: 3,
      badgeBg: '#ffd6e0',
      badgeText: '#8f3051',
      bodyColor: '#ffb3c6',
      accentColor: '#ff8fab',
    },
    {
      rank: 2,
      name: 'Clover Hopper',
      pointsRequired: 70,
      eatValue: 34,
      radius: 26,
      speed: 230,
      maxHp: 3,
      badgeBg: '#fff0c2',
      badgeText: '#8a5a00',
      bodyColor: '#ffe08a',
      accentColor: '#ffc857',
    },
    {
      rank: 3,
      name: 'Peach Beetle',
      pointsRequired: 170,
      eatValue: 50,
      radius: 31,
      speed: 234,
      maxHp: 4,
      badgeBg: '#ffe2cc',
      badgeText: '#9c4516',
      bodyColor: '#ffc09f',
      accentColor: '#ff9b71',
    },
    {
      rank: 4,
      name: 'Sky Pillbug',
      pointsRequired: 310,
      eatValue: 70,
      radius: 36,
      speed: 238,
      maxHp: 4,
      badgeBg: '#d6ecff',
      badgeText: '#1e5c8a',
      bodyColor: '#a8d8ff',
      accentColor: '#7bc1ff',
    },
    {
      rank: 5,
      name: 'Lilac Firefly',
      pointsRequired: 500,
      eatValue: 96,
      radius: 42,
      speed: 242,
      maxHp: 5,
      badgeBg: '#e8d8ff',
      badgeText: '#5c318c',
      bodyColor: '#d0b3ff',
      accentColor: '#b78aff',
    },
    {
      rank: 6,
      name: 'Mint Cicada',
      pointsRequired: 740,
      eatValue: 130,
      radius: 48,
      speed: 245,
      maxHp: 5,
      badgeBg: '#ccf7ec',
      badgeText: '#176b5b',
      bodyColor: '#98ebd8',
      accentColor: '#66d9be',
    },
    {
      rank: 7,
      name: 'Berry Scarab',
      pointsRequired: 1050,
      eatValue: 170,
      radius: 55,
      speed: 248,
      maxHp: 6,
      badgeBg: '#ffd6f2',
      badgeText: '#8c286c',
      bodyColor: '#fface4',
      accentColor: '#f77fd0',
    },
    {
      rank: 8,
      name: 'Cloud Dragonfly',
      pointsRequired: 1440,
      eatValue: 220,
      radius: 63,
      speed: 250,
      maxHp: 6,
      badgeBg: '#d4f1f9',
      badgeText: '#1b6075',
      bodyColor: '#9ce0f5',
      accentColor: '#67c8e8',
    },
    {
      rank: 9,
      name: 'Starlight Moth',
      pointsRequired: 1920,
      eatValue: 280,
      radius: 71,
      speed: 252,
      maxHp: 7,
      badgeBg: '#f6dcff',
      badgeText: '#6f2a8c',
      bodyColor: '#e4b3ff',
      accentColor: '#cf85ff',
    },
    {
      rank: 10,
      name: 'Pastel Monarch',
      pointsRequired: 2500,
      eatValue: 360,
      radius: 80,
      speed: 255,
      maxHp: 8,
      badgeBg: '#fff2b2',
      badgeText: '#7a5200',
      bodyColor: '#ffe588',
      accentColor: '#ffbd59',
    },
  ];

  const MAX_RANK = RANKS[RANKS.length - 1].rank;

  /**
   * Cute bug skins! Every skin keeps the character unmistakably a cute animated bug
   * (bug body, tiny wiggling legs, translucent wings, bobbing antennae) dressed up
   * with adorable animal / fantasy traits.
   */
  const SKINS = [
    {
      id: 'classic',
      name: 'Meadow Bug',
      cost: 0,
      tag: 'Starter',
      description: 'Sweet rosy-cheeked garden beetle with speckled pastel wings.',
      palette: {
        body: '#ffb3c6',
        shell: '#ff8fab',
        belly: '#fff0f3',
        head: '#ffd6e0',
        wing: 'rgba(255, 255, 255, 0.72)',
        accent: '#ffe5ec',
        sparkle: '#ff9ebb',
      },
      features: {
        type: 'classic',
        spots: 'dots',
      },
    },
    {
      id: 'kitty',
      name: 'Kitty Bug',
      cost: 60,
      tag: 'Purr-fect',
      description: 'Pastel tabby beetle with twitchy cat ears, tiny whiskers, and a swishing kitty tail!',
      palette: {
        body: '#e5c6ff',
        shell: '#d1a3ff',
        belly: '#faf2ff',
        head: '#f0dcff',
        wing: 'rgba(255, 232, 248, 0.78)',
        accent: '#ff9ebb',
        sparkle: '#e0aaff',
      },
      features: {
        type: 'kitty',
        spots: 'stripes',
      },
    },
    {
      id: 'doggy',
      name: 'Doggy Bug',
      cost: 110,
      tag: 'Good Bug',
      description: 'Floppy-eared puppy beetle with a cute boopable nose and a happy wagging tail!',
      palette: {
        body: '#ffe0b5',
        shell: '#f7c588',
        belly: '#fff8ec',
        head: '#ffebd0',
        wing: 'rgba(255, 248, 225, 0.78)',
        accent: '#c98a5b',
        sparkle: '#ffd180',
      },
      features: {
        type: 'doggy',
        spots: 'patches',
      },
    },
    {
      id: 'bunny',
      name: 'Bunny Bug',
      cost: 170,
      tag: 'Bouncy',
      description: 'Soft sky-blue bunny beetle with bouncy long ears and a fluffy cotton-puff tail!',
      palette: {
        body: '#bde0fe',
        shell: '#98ccfc',
        belly: '#f2f9ff',
        head: '#d7ecff',
        wing: 'rgba(255, 240, 248, 0.78)',
        accent: '#ffb3c6',
        sparkle: '#a2d2ff',
      },
      features: {
        type: 'bunny',
        spots: 'hearts',
      },
    },
    {
      id: 'bear',
      name: 'Honey Bear Bug',
      cost: 240,
      tag: 'Cozy',
      description: 'Fuzzy pastel bumble-bear bug with round teddy ears and sweet honey stripes!',
      palette: {
        body: '#ffe899',
        shell: '#ffd466',
        belly: '#fff9e6',
        head: '#ffefbd',
        wing: 'rgba(255, 255, 255, 0.8)',
        accent: '#b57c4c',
        sparkle: '#ffe066',
      },
      features: {
        type: 'bear',
        spots: 'beeStripes',
      },
    },
    {
      id: 'axolotl',
      name: 'Axolotl Bug',
      cost: 320,
      tag: 'Splashy',
      description: 'Strawberry-milk axolotl bug with feathery pink frills and shimmery bubble wings!',
      palette: {
        body: '#ffc4d6',
        shell: '#ffa6c1',
        belly: '#fff2f6',
        head: '#ffd9e5',
        wing: 'rgba(210, 248, 255, 0.78)',
        accent: '#ff6f9c',
        sparkle: '#9ef0f0',
      },
      features: {
        type: 'axolotl',
        spots: 'bubbles',
      },
    },
    {
      id: 'unicorn',
      name: 'Unicorn Moth',
      cost: 420,
      tag: 'Magical',
      description: 'Dreamy pastel silk-moth with a sparkly golden horn and rainbow shimmer wings!',
      palette: {
        body: '#d8f3ff',
        shell: '#cbb8ff',
        belly: '#ffffff',
        head: '#f3e8ff',
        wing: 'rgba(255, 224, 245, 0.82)',
        accent: '#ffd166',
        sparkle: '#ffd6ff',
      },
      features: {
        type: 'unicorn',
        spots: 'stars',
      },
    },
    {
      id: 'royal',
      name: 'Royal Butterfly',
      cost: 540,
      tag: 'Majestic',
      description: 'Iridescent mint & rose-gold jewel bug wearing a bouncy tiny golden crown!',
      palette: {
        body: '#b8f2e6',
        shell: '#8ee3d2',
        belly: '#f2fffc',
        head: '#d4faf2',
        wing: 'rgba(255, 238, 190, 0.82)',
        accent: '#ffbe55',
        sparkle: '#ffe66d',
      },
      features: {
        type: 'royal',
        spots: 'gems',
      },
    },
  ];

  const AI_NAMES = [
    'Mochi', 'Pip', 'Clover', 'Peaches', 'Boba', 'Daisy', 'Sprinkle', 'Noodle',
    'Cupcake', 'Mimi', 'Waffles', 'Bubbles', 'Lulu', 'Pebble', 'Honey', 'Puff',
    'Dottie', 'Sunny', 'Berry', 'Tofu', 'Petal', 'Pudding', 'Bean', 'Twinkle',
    'Kiwi', 'Biscuit', 'Coco', 'Marshmallow', 'Maple', 'Plum', 'Pippin', 'Dewy',
  ];

  const COMBAT = {
    boostSpeedMultiplier: 1.58,
    boostDrainPerSec: 46,
    boostRegenPerSec: 26,
    hurtInvulnSec: 1.15,
    hpRegenDelaySec: 6.5,
    hpRegenIntervalSec: 5.5,
    knockbackSpeed: 420,
  };

  function getRankConfig(rank) {
    const clamped = Math.max(0, Math.min(MAX_RANK, Math.floor(rank)));
    return RANKS[clamped];
  }

  function getSkinConfig(skinId) {
    return SKINS.find((s) => s.id === skinId) || SKINS[0];
  }

  function getFoodType(foodTypeId) {
    return FOOD_TYPES.find((f) => f.id === foodTypeId) || FOOD_TYPES[0];
  }

  function getEffectConfig(effectId) {
    return EFFECTS[effectId] || null;
  }

  DeeBug.Config = {
    STORAGE_PREFIX,
    WORLD,
    EFFECTS,
    FOOD_TYPES,
    RANKS,
    MAX_RANK,
    SKINS,
    AI_NAMES,
    COMBAT,
    getRankConfig,
    getSkinConfig,
    getFoodType,
    getEffectConfig,
  };
})(window);
