/* ════════════════════════════════════════════════
   SMART FITNESS & DIET PLANNER — script.js
   All core logic: BMI, Calories, Diet, Exercise
   localStorage, Theme Toggle, Download
════════════════════════════════════════════════ */

'use strict';

/* ══ DOM References ══ */
const splash         = document.getElementById('splash');
const app            = document.getElementById('app');
const themeToggle    = document.getElementById('themeToggle');
const fitnessForm    = document.getElementById('fitnessForm');
const resetBtn       = document.getElementById('resetBtn');
const generateBtn    = document.getElementById('generateBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText    = document.getElementById('loadingText');
const resultsSection = document.getElementById('results');
const downloadBtn    = document.getElementById('downloadBtn');
const recalcBtn      = document.getElementById('recalcBtn');

/* ══ Loading messages cycling ══ */
const LOADING_MSGS = [
  'Analysing your data…',
  'Calculating BMI…',
  'Building your meal plan…',
  'Designing your workout…',
  'Finalising results…',
];

/* ══════════════════════════════════════════
   SPLASH SCREEN
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  // Wait for loading bar animation (~3.7s total), then dismiss splash
  setTimeout(() => {
    splash.classList.add('exit');
    setTimeout(() => {
      splash.style.display = 'none';
      app.classList.remove('hidden');
      // Restore saved theme
      restoreTheme();
      // Restore saved form data
      restoreFormData();
    }, 700);
  }, 3700);
});

/* ══════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════ */
function restoreTheme() {
  const saved = localStorage.getItem('fpTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fpTheme', next);
});

/* ══════════════════════════════════════════
   FORM: SAVE / RESTORE / RESET
══════════════════════════════════════════ */
function restoreFormData() {
  const saved = localStorage.getItem('fpFormData');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.age)    document.getElementById('age').value    = data.age;
    if (data.height) document.getElementById('height').value = data.height;
    if (data.weight) document.getElementById('weight').value = data.weight;
    if (data.gender) {
      const r = document.querySelector(`input[name="gender"][value="${data.gender}"]`);
      if (r) r.checked = true;
    }
    if (data.goal) {
      const r = document.querySelector(`input[name="goal"][value="${data.goal}"]`);
      if (r) r.checked = true;
    }
    if (data.food) {
      const r = document.querySelector(`input[name="food"][value="${data.food}"]`);
      if (r) r.checked = true;
    }
    if (data.budget) {
      const r = document.querySelector(`input[name="budget"][value="${data.budget}"]`);
      if (r) r.checked = true;
    }
  } catch(e) { /* ignore corrupt data */ }
}

function saveFormData(data) {
  localStorage.setItem('fpFormData', JSON.stringify(data));
}

resetBtn.addEventListener('click', () => {
  fitnessForm.reset();
  localStorage.removeItem('fpFormData');
  resultsSection.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

recalcBtn.addEventListener('click', () => {
  resultsSection.classList.add('hidden');
  document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
});

/* ══════════════════════════════════════════
   CORE CALCULATIONS
══════════════════════════════════════════ */

/**
 * Calculate BMI
 * @param {number} weight - kg
 * @param {number} height - cm
 * @returns {number}
 */
function calcBMI(weight, height) {
  const h = height / 100;
  return +(weight / (h * h)).toFixed(1);
}

/**
 * Get BMI category + color
 */
function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6', pos: 10 };
  if (bmi < 25)   return { label: 'Normal Weight', color: '#6EE7B7', pos: 38 };
  if (bmi < 30)   return { label: 'Overweight', color: '#FB923C', pos: 65 };
  return              { label: 'Obese', color: '#F87171', pos: 88 };
}

/**
 * Calculate BMR using Mifflin-St Jeor
 */
function calcBMR(weight, height, age, gender) {
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * Using moderate activity (1.55) as base
 */
function calcTDEE(bmr) {
  return Math.round(bmr * 1.55);
}

/**
 * Adjust calories based on goal
 */
function adjustCalories(tdee, goal) {
  if (goal === 'loss')     return Math.round(tdee - 500);
  if (goal === 'gain')     return Math.round(tdee + 400);
  return tdee; // maintain
}

/**
 * Compute macros (rough split)
 * Loss: 35P/40C/25F  |  Maintain: 30P/45C/25F  |  Gain: 30P/50C/20F
 */
function calcMacros(calories, goal) {
  const splits = {
    loss:     { p: 0.35, c: 0.40, f: 0.25 },
    maintain: { p: 0.30, c: 0.45, f: 0.25 },
    gain:     { p: 0.30, c: 0.50, f: 0.20 },
  };
  const s = splits[goal];
  return {
    protein: Math.round((calories * s.p) / 4),  // 4 kcal/g
    carbs:   Math.round((calories * s.c) / 4),
    fat:     Math.round((calories * s.f) / 9),  // 9 kcal/g
  };
}

/* ══════════════════════════════════════════
   DIET PLAN DATA
══════════════════════════════════════════ */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

/**
 * Returns 7-day meal plan based on food pref + budget + goal.
 * Plans follow real Indian dietary patterns across three budget tiers.
 *
 * LOW    → Student-friendly, dal-roti-sabzi core, soaked chana/peanuts
 * MEDIUM → Balanced: milk/egg/paneer, dal, curd, roti-rice mix
 * HIGH   → Fitness-focus: oats, brown rice, paneer/chicken/fish, soup
 */
function getDietPlan(food, budget, goal) {

  /* ──────────────────────────────────────────
     🥗 🪙 LOW BUDGET — Student Friendly (Veg)
     Cheap + healthy | Good for maintenance & light weight loss
  ────────────────────────────────────────── */
  const vegLow = {
    // 🌅 Morning: soaked chana / peanuts + 1 banana (rotated across days)
    breakfast: [
      'Soaked kala chana + 1 banana',
      'Soaked moongfali (peanuts) + 1 banana',
      'Soaked chana + 1 banana + lemon water',
      'Boiled peanuts + 1 banana',
      'Soaked chana with onion-tomato + 1 banana',
      'Roasted chana + 1 banana',
      'Soaked kala chana + 1 banana + gur',
    ],
    // 🍛 Lunch: Rice + Dal + Seasonal Sabzi + Salad
    lunch: [
      'Rice + Dal + Aloo sabzi + Cucumber-onion salad',
      'Rice + Dal + Lau (bottle gourd) sabzi + Salad',
      'Rice + Dal + Cabbage sabzi + Kheera salad',
      'Rice + Dal + Aloo-gobhi sabzi + Onion salad',
      'Rice + Dal + Tinda sabzi + Cucumber salad',
      'Dal khichdi + Aloo sabzi + Salad',
      'Rice + Dal + Mixed seasonal sabzi + Salad',
    ],
    // 🌙 Dinner: 2–3 Roti + Sabzi + Dal (optional)
    dinner: [
      '2–3 Roti + Aloo sabzi + Dal',
      '2–3 Roti + Cabbage sabzi + Dal',
      '2–3 Roti + Mixed sabzi + Dal (optional)',
      '2–3 Roti + Lau sabzi + Dal',
      '3 Roti + Bhindi sabzi + Dahi',
      '2 Roti + Aloo-palak sabzi + Dal',
      '2–3 Roti + Seasonal sabzi + Dal',
    ],
    // 🌿 Snack (afternoon / evening)
    snack: [
      'Roasted chana handful',
      '1 Banana',
      'Boiled peanuts',
      'Cucumber slices + salt',
      'Gur (jaggery) + water',
      'Seasonal fruit (guava/amla)',
      'Sattu drink (with water + salt)',
    ],
  };

  /* ──────────────────────────────────────────
     🥗 🪙 LOW BUDGET — Student Friendly (Non-Veg)
     Eggs as primary protein source
  ────────────────────────────────────────── */
  const nonvegLow = {
    breakfast: [
      '2 Boiled eggs + 1 banana',
      'Egg bhurji (2 eggs) + 1 roti + 1 banana',
      '2 Boiled eggs + lemon water',
      'Omelette (2 eggs) + bread slice',
      '2 Boiled eggs + roasted chana',
      'Egg poha + 1 banana',
      'Bread omelette (2 eggs) + 1 banana',
    ],
    lunch: [
      'Rice + Egg curry + Salad',
      'Rice + Dal + 2 Boiled eggs + Salad',
      'Rice + Fish fry (small) + Salad',
      'Rice + Egg bhurji + Sabzi + Salad',
      'Rice + Dal + Chicken curry (small) + Salad',
      'Egg biryani + Kheera raita',
      'Rice + Dal + Omelette + Onion salad',
    ],
    snack: [
      '1 Boiled egg',
      'Roasted chana',
      '1 Banana',
      'Boiled peanuts',
      'Buttermilk (chaas)',
      '1 Boiled egg + salt-pepper',
      'Sweet potato (boiled)',
    ],
    dinner: [
      '2 Roti + Egg bhurji + Dal',
      '2 Roti + Chicken curry (small) + Dal',
      '2 Roti + Fish curry + Salad',
      '2 Roti + Egg sabzi + Dal',
      'Rice + Egg curry + Salad',
      '2 Roti + Omelette + Salad',
      '2 Roti + Boiled eggs + Sabzi',
    ],
  };

  /* ──────────────────────────────────────────
     🥗 💰 MEDIUM BUDGET — Balanced Diet (Veg)
     Better protein | Good for fitness + muscle maintenance
  ────────────────────────────────────────── */
  const vegMedium = {
    // 🌅 Morning: 1 glass milk + paneer + 1 fruit
    breakfast: [
      '1 Glass milk + 2 Paneer slices + 1 banana',
      '1 Glass milk + Besan chilla + 1 apple',
      '1 Glass milk + Paneer sandwich + 1 banana',
      '1 Glass milk + Oats + 1 banana',
      '1 Glass milk + Poha with veggies + 1 fruit',
      '1 Glass milk + 2 Paneer slices + 1 apple',
      '1 Glass milk + Idli (2) + 1 banana',
    ],
    // 🍛 Lunch: Rice / 2–3 Roti + Dal + Paneer/Soyabean sabzi + Salad
    lunch: [
      '2 Roti + Dal + Paneer sabzi + Salad',
      'Rice + Dal + Soyabean curry + Salad',
      '2–3 Roti + Dal + Paneer bhurji + Salad',
      'Rice + Dal + Paneer matar + Salad',
      '2 Roti + Dal + Soya chunk curry + Salad',
      'Rice + Dal makhani + Paneer sabzi + Salad',
      '2–3 Roti + Dal + Mixed veg + Curd',
    ],
    snack: [
      'Fruit bowl (banana + apple)',
      'Roasted makhana',
      'Paneer cubes (small portion)',
      'Mixed nuts (handful)',
      'Curd with honey',
      'Sprouts chaat',
      '1 Glass buttermilk + roasted chana',
    ],
    // 🌙 Dinner: 2 Roti + Light Sabzi + Curd (dahi)
    dinner: [
      '2 Roti + Light sabzi + Dahi',
      '2 Roti + Palak sabzi + Dahi',
      '2 Roti + Mixed veg + Dahi',
      '2 Roti + Aloo-gobhi sabzi + Dahi',
      '2 Roti + Paneer sabzi (light) + Dahi',
      '2 Roti + Dal + Dahi',
      '2 Roti + Bhindi sabzi + Dahi',
    ],
  };

  /* ──────────────────────────────────────────
     🥗 💰 MEDIUM BUDGET — Balanced Diet (Non-Veg)
  ────────────────────────────────────────── */
  const nonvegMedium = {
    breakfast: [
      '1 Glass milk + 2 Boiled eggs + 1 banana',
      '1 Glass milk + Egg omelette + 1 apple',
      '1 Glass milk + 2 Boiled eggs + bread slice',
      '1 Glass milk + Egg bhurji + 1 banana',
      '1 Glass milk + 2 Boiled eggs + 1 fruit',
      '1 Glass milk + Chicken sandwich + 1 banana',
      '1 Glass milk + 2 Eggs any style + 1 apple',
    ],
    lunch: [
      '2 Roti + Chicken curry + Salad',
      'Rice + Dal + Egg curry + Salad',
      'Rice + Fish curry + Salad + Curd',
      '2–3 Roti + Chicken palak + Salad',
      'Rice + Egg biryani + Raita',
      '2 Roti + Mutton curry (small) + Salad',
      'Rice + Dal + Grilled chicken + Salad',
    ],
    snack: [
      '2 Boiled eggs',
      'Chicken tikka (small)',
      'Boiled eggs + chaat masala',
      'Protein shake (milk + banana)',
      'Tuna / egg salad',
      'Mixed nuts + 1 boiled egg',
      '1 Glass buttermilk + roasted chana',
    ],
    dinner: [
      '2 Roti + Egg bhurji + Dahi',
      '2 Roti + Chicken curry (light) + Dahi',
      '2 Roti + Fish sabzi + Dahi',
      '2 Roti + Omelette + Salad + Dahi',
      'Rice + Dal + Egg curry + Dahi',
      '2 Roti + Grilled chicken + Salad',
      '2 Roti + Boiled eggs + Light sabzi + Dahi',
    ],
  };

  /* ──────────────────────────────────────────
     🥗 💎 HIGH BUDGET — High Protein / Fitness Focus (Veg)
     Best for muscle gain / fat loss
  ────────────────────────────────────────── */
  const vegHigh = {
    // 🌅 Morning: Oats + milk + dry fruits + paneer/tofu + 1 fruit
    breakfast: [
      'Oats + milk + dry fruits + 2 Paneer slices + 1 banana',
      'Oats + milk + almonds + Tofu scramble + 1 apple',
      'Oats + milk + walnuts + Paneer bhurji + 1 banana',
      'Oats + milk + dry fruits + Besan chilla (2) + 1 fruit',
      'Oats + milk + cashews + Paneer toast + 1 banana',
      'Oats + milk + raisins + Tofu omelette + 1 apple',
      'Oats + milk + mixed dry fruits + 3 Paneer slices + 1 banana',
    ],
    // 🍛 Lunch: Brown rice / Roti + Paneer/Tofu/Fish + Green veg + Salad + Curd
    lunch: [
      'Brown rice + Paneer curry + Green sabzi + Salad + Curd',
      '2 Roti + Palak paneer + Brown rice + Salad + Curd',
      'Brown rice + Tofu stir-fry + Broccoli + Salad + Curd',
      '2–3 Roti + Paneer bhurji + Sautéed greens + Salad + Curd',
      'Brown rice + Soya chunk curry + Green veg + Salad + Curd',
      '2 Roti + Paneer matar + Spinach sabzi + Salad + Curd',
      'Brown rice + Dal + Paneer tikka + Salad + Curd',
    ],
    snack: [
      'Protein shake (whey + milk)',
      'Greek yogurt + honey + almonds',
      'Paneer cubes + chaat masala',
      'Trail mix (dry fruits + seeds)',
      'Sprouts chaat + lemon',
      'Banana + peanut butter',
      'Roasted makhana + mixed nuts',
    ],
    // 🌙 Dinner: 2 Roti + Light protein (paneer) + Soup (optional)
    dinner: [
      '2 Roti + Grilled paneer + Vegetable soup',
      '2 Roti + Tofu stir-fry + Tomato soup',
      '2 Roti + Paneer sabzi (light) + Spinach soup',
      '2 Roti + Soya curry + Dal soup',
      '2 Roti + Paneer bhurji + Green salad',
      '2 Roti + Tofu scramble + Vegetable soup',
      '2 Roti + Light paneer curry + Soup',
    ],
  };

  /* ──────────────────────────────────────────
     🥗 💎 HIGH BUDGET — High Protein / Fitness Focus (Non-Veg)
  ────────────────────────────────────────── */
  const nonvegHigh = {
    breakfast: [
      'Oats + milk + dry fruits + 3–4 Boiled eggs + 1 banana',
      'Oats + milk + almonds + 3 Egg omelette + 1 apple',
      'Oats + milk + walnuts + Egg bhurji (3 eggs) + 1 banana',
      'Oats + milk + dry fruits + Chicken omelette + 1 fruit',
      'Oats + milk + cashews + 4 Boiled eggs + 1 banana',
      'Oats + milk + raisins + Scrambled eggs (3) + 1 apple',
      'Oats + milk + mixed dry fruits + 3–4 Eggs any style + 1 banana',
    ],
    lunch: [
      'Brown rice + Chicken curry + Green sabzi + Salad + Curd',
      '2 Roti + Fish curry + Sautéed greens + Salad + Curd',
      'Brown rice + Grilled chicken + Broccoli + Salad + Curd',
      '2–3 Roti + Chicken palak + Brown rice + Salad + Curd',
      'Brown rice + Prawn curry + Green veg + Salad + Curd',
      '2 Roti + Mutton curry + Spinach sabzi + Salad + Curd',
      'Brown rice + Dal + Grilled fish + Salad + Curd',
    ],
    snack: [
      'Protein shake (whey + milk)',
      '2 Boiled eggs + almonds',
      'Chicken tikka (grilled)',
      'Greek yogurt + honey',
      'Tuna salad + lemon',
      'Boiled eggs + mixed nuts',
      'Banana + peanut butter + protein shake',
    ],
    dinner: [
      '2 Roti + Grilled chicken breast + Vegetable soup',
      '2 Roti + Fish curry (light) + Tomato soup',
      '2 Roti + Chicken stir-fry + Green salad',
      '2 Roti + Egg bhurji + Dal soup',
      '2 Roti + Grilled fish + Spinach soup',
      '2 Roti + Chicken tikka (light) + Soup',
      '2 Roti + Prawn sabzi (light) + Vegetable soup',
    ],
  };

  /* ── Select correct plan ── */
  let meals;
  if (food === 'veg') {
    meals = budget === 'low' ? vegLow : budget === 'medium' ? vegMedium : vegHigh;
  } else {
    meals = budget === 'low' ? nonvegLow : budget === 'medium' ? nonvegMedium : nonvegHigh;
  }

  // Build 7-day plan with calorie estimates per goal
  return DAYS.map((day, i) => ({
    day,
    meals: [
      { time: '🌅 Morning',   name: meals.breakfast[i], cal: getCalRange(goal, 'breakfast') },
      { time: '🍛 Lunch',     name: meals.lunch[i],     cal: getCalRange(goal, 'lunch') },
      { time: '🌿 Snack',     name: meals.snack[i],     cal: getCalRange(goal, 'snack') },
      { time: '🌙 Dinner',    name: meals.dinner[i],    cal: getCalRange(goal, 'dinner') },
    ],
  }));
}

function getCalRange(goal, mealType) {
  /* Calorie estimates per meal slot, adjusted by goal */
  const ranges = {
    loss:     { breakfast: '250–320 kcal', lunch: '380–450 kcal', snack: '80–130 kcal',  dinner: '320–380 kcal' },
    maintain: { breakfast: '350–400 kcal', lunch: '500–560 kcal', snack: '130–180 kcal', dinner: '420–480 kcal' },
    gain:     { breakfast: '450–520 kcal', lunch: '620–700 kcal', snack: '200–260 kcal', dinner: '580–650 kcal' },
  };
  return ranges[goal][mealType];
}

/* ══════════════════════════════════════════
   EXERCISE PLAN DATA
══════════════════════════════════════════ */
/**
 * Returns weekly workout plan based on goal + BMI.
 *
 * Routine philosophy: Simple, consistent, no heavy gym needed.
 * Follows a realistic daily structure:
 *   🌅 Morning  (10–15 min) — stretching + bodyweight
 *   ☀️ Afternoon             — walk + normal activity
 *   🌙 Evening  (15–20 min) — light workout
 *   🌿 Night                 — light walk + sleep before 11 PM
 */
function getExercisePlan(goal, bmi) {
  const level = bmi > 27 || bmi < 18 ? 'Beginner' : 'Intermediate';

  /* ── WEIGHT LOSS plan ── */
  const lossplan = [
    {
      day: 'Mon', icon: '🌅', title: 'Cardio Morning',
      detail: '10 Push-ups · 15 Squats\n20 Jumping Jacks · 5 min brisk walk',
      badge: 'cardio',
    },
    {
      day: 'Tue', icon: '💪', title: 'Bodyweight',
      detail: '2×10 Push-ups · 2×15 Squats\nPlank 30s×2 · Evening stretch',
      badge: 'strength',
    },
    {
      day: 'Wed', icon: '🚶', title: 'Walk Day',
      detail: '15 min morning stretch\n30–40 min brisk walk\n10 min night walk',
      badge: 'cardio',
    },
    {
      day: 'Thu', icon: '⚡', title: 'Circuit',
      detail: 'Jumping Jacks 20 · Push-ups 10\nSquats 15 · Plank 30s × 3 rounds',
      badge: 'hiit',
    },
    {
      day: 'Fri', icon: '🏃', title: 'Morning Run',
      detail: '5 min stretch · 20 min jog\nEvening: 2×Push-ups + 2×Squats',
      badge: 'cardio',
    },
    {
      day: 'Sat', icon: '🔥', title: 'Full Routine',
      detail: 'Morning 15 min · Afternoon walk\nEvening: full bodyweight circuit',
      badge: 'hiit',
    },
    {
      day: 'Sun', icon: '😴', title: 'Rest Day',
      detail: 'Light 10 min walk\nSleep before 11 PM · Hydrate',
      badge: 'rest',
    },
  ];

  /* ── MAINTAIN plan ── */
  const maintainplan = [
    {
      day: 'Mon', icon: '🌅', title: 'Morning Routine',
      detail: 'Stretching · 10 Push-ups\n15 Squats · 20 Jumping Jacks',
      badge: 'strength',
    },
    {
      day: 'Tue', icon: '🚶', title: 'Active Day',
      detail: 'Morning stretch 10 min\n15 min afternoon walk\n10 min night walk',
      badge: 'cardio',
    },
    {
      day: 'Wed', icon: '💪', title: 'Evening Workout',
      detail: '2×Push-ups · 2×Squats\nPlank 30s×2 · Light jog 15 min',
      badge: 'strength',
    },
    {
      day: 'Thu', icon: '🧘', title: 'Yoga + Core',
      detail: '20 min yoga / stretching\nPlank 30s×3 · Breathing exercises',
      badge: 'recovery',
    },
    {
      day: 'Fri', icon: '⚡', title: 'Circuit',
      detail: 'Jumping Jacks · Push-ups\nSquats · Plank — 3 rounds',
      badge: 'hiit',
    },
    {
      day: 'Sat', icon: '🏃', title: 'Longer Walk',
      detail: '30–45 min brisk walk\nMorning stretch + evening stroll',
      badge: 'cardio',
    },
    {
      day: 'Sun', icon: '😴', title: 'Rest Day',
      detail: '5–10 min light walk\nSleep before 11 PM · Hydrate',
      badge: 'rest',
    },
  ];

  /* ── MUSCLE GAIN plan ── */
  const gainplan = [
    {
      day: 'Mon', icon: '💪', title: 'Push Day',
      detail: 'Push-ups 3×12 · Squats 3×15\nJumping Jacks · Plank 30s×2',
      badge: 'strength',
    },
    {
      day: 'Tue', icon: '🦵', title: 'Legs + Core',
      detail: 'Squats 3×15 · Lunges 2×12\nCalf raises · Plank 30s×3',
      badge: 'strength',
    },
    {
      day: 'Wed', icon: '🧘', title: 'Active Rest',
      detail: 'Light stretching 20 min\n10 min walk · Breathing exercises',
      badge: 'recovery',
    },
    {
      day: 'Thu', icon: '💪', title: 'Upper Body',
      detail: 'Push-ups 3×12 · Dips (chair)\nPike push-ups · Plank 40s×2',
      badge: 'strength',
    },
    {
      day: 'Fri', icon: '🔥', title: 'Full Body',
      detail: 'Push-ups · Squats · Lunges\nPlank · Jumping Jacks — 4 rounds',
      badge: 'hiit',
    },
    {
      day: 'Sat', icon: '🏃', title: 'Cardio + Core',
      detail: '20 min jog or brisk walk\nCore: Plank · Crunches · Leg raises',
      badge: 'cardio',
    },
    {
      day: 'Sun', icon: '😴', title: 'Rest Day',
      detail: '5–10 min light walk\nSleep before 11 PM · High protein intake',
      badge: 'rest',
    },
  ];

  const plans = { loss: lossplan, maintain: maintainplan, gain: gainplan };
  return { days: plans[goal], level };
}

/* ══════════════════════════════════════════
   MOTIVATIONAL MESSAGES
══════════════════════════════════════════ */
function getMotivation(bmi, goal) {
  if (goal === 'loss' && bmi >= 30)
    return '💪 Every journey begins with a single step. You\'ve got this — let\'s burn that fat and reveal the best version of you!';
  if (goal === 'loss' && bmi >= 25)
    return '🔥 You\'re closer than you think! A few mindful choices every day will get you to your ideal weight. Stay consistent!';
  if (goal === 'gain' && bmi < 18.5)
    return '🚀 Time to fuel up and build! With the right nutrition and training, you\'ll gain strength and confidence every week.';
  if (goal === 'gain')
    return '🏋️ Let\'s pack on that muscle! Eat big, lift heavy, sleep well — your transformation has officially begun.';
  if (bmi >= 18.5 && bmi < 25)
    return '✨ You\'re already in a great place! This plan will help you maintain your fitness and feel incredible every single day.';
  return '🌟 Your health journey is personal and powerful. Trust the process, stay consistent, and the results will follow!';
}

/* ══════════════════════════════════════════
   RENDER RESULTS
══════════════════════════════════════════ */
function renderResults(data) {
  const { age, gender, height, weight, goal, food, budget } = data;

  /* — BMI — */
  const bmi = calcBMI(weight, height);
  const bmiCat = getBMICategory(bmi);

  document.getElementById('bmiValue').textContent = bmi;
  document.getElementById('bmiLabel').textContent = bmiCat.label;
  document.getElementById('bmiLabel').style.color = bmiCat.color;
  document.getElementById('bmiValue').style.color = bmiCat.color;
  document.getElementById('bmiValue').style.webkitTextFillColor = bmiCat.color;

  // Needle position on scale
  setTimeout(() => {
    document.getElementById('bmiNeedle').style.left = bmiCat.pos + '%';
    document.getElementById('bmiNeedle').style.background = bmiCat.color;
  }, 600);

  // BMI stats
  const idealMin = +(18.5 * (height/100) ** 2).toFixed(1);
  const idealMax = +(24.9 * (height/100) ** 2).toFixed(1);
  document.getElementById('bmiStats').innerHTML = `
    <div class="bmi-stat-item">
      <span class="bmi-stat-label">Your BMI</span>
      <span class="bmi-stat-val" style="color:${bmiCat.color}">${bmi}</span>
    </div>
    <div class="bmi-stat-item">
      <span class="bmi-stat-label">Status</span>
      <span class="bmi-stat-val" style="color:${bmiCat.color}">${bmiCat.label}</span>
    </div>
    <div class="bmi-stat-item">
      <span class="bmi-stat-label">Ideal Weight Range</span>
      <span class="bmi-stat-val">${idealMin}–${idealMax} kg</span>
    </div>
    <div class="bmi-stat-item">
      <span class="bmi-stat-label">Height / Weight</span>
      <span class="bmi-stat-val">${height} cm / ${weight} kg</span>
    </div>
  `;

  /* — Calories — */
  const bmr     = calcBMR(weight, height, age, gender);
  const tdee    = calcTDEE(bmr);
  const targets = adjustCalories(tdee, goal);
  const macros  = calcMacros(targets, goal);

  document.getElementById('calNum').textContent = targets.toLocaleString();

  // Animate ring: max ~3500 kcal maps to full circle
  const pct = Math.min(targets / 3500, 1);
  const dash = Math.round(314 * (1 - pct));
  setTimeout(() => {
    document.getElementById('calRingProg').style.strokeDashoffset = dash;
  }, 400);

  // Add SVG gradient def
  const svgEl = document.querySelector('.cal-ring');
  if (!svgEl.querySelector('defs')) {
    svgEl.insertAdjacentHTML('afterbegin', `
      <defs>
        <linearGradient id="calGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6EE7B7"/>
          <stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
      </defs>
    `);
  }

  document.getElementById('macroRow').innerHTML = `
    <div class="macro-item">
      <span class="macro-name">Protein</span>
      <span class="macro-val green">${macros.protein}g</span>
    </div>
    <div class="macro-item">
      <span class="macro-name">Carbs</span>
      <span class="macro-val blue">${macros.carbs}g</span>
    </div>
    <div class="macro-item">
      <span class="macro-name">Fat</span>
      <span class="macro-val orange">${macros.fat}g</span>
    </div>
  `;

  const goalNote = {
    loss:     `Deficit of ~500 kcal/day from your TDEE of ${tdee.toLocaleString()} kcal for ~0.5kg/week loss.`,
    maintain: `Maintenance calories matching your TDEE of ${tdee.toLocaleString()} kcal.`,
    gain:     `Surplus of ~400 kcal/day above your TDEE of ${tdee.toLocaleString()} kcal for lean muscle gain.`,
  };
  document.getElementById('calNote').textContent = goalNote[goal];

  /* — Diet Plan — */
  const pref = food === 'veg' ? '🥦 Vegetarian' : '🍗 Non-Vegetarian';
  const budgetLabel = { low: '💸 Budget', medium: '💰 Standard', high: '💎 Premium' }[budget];
  document.getElementById('dietSub').textContent = `${pref} · ${budgetLabel} · ${goal === 'loss' ? 'Calorie Deficit' : goal === 'gain' ? 'Calorie Surplus' : 'Balanced'}`;

  const plan = getDietPlan(food, budget, goal);
  renderDietTabs(plan);

  /* — Exercise Plan — */
  const ex = getExercisePlan(goal, bmi);
  document.getElementById('exerciseSub').textContent = `${ex.level} Level · Goal: ${goal === 'loss' ? 'Fat Loss' : goal === 'gain' ? 'Muscle Gain' : 'Maintenance'}`;
  renderExercise(ex.days);

  /* — Motivation — */
  document.getElementById('motivationBanner').textContent = getMotivation(bmi, goal);

  /* — Save plan data for download — */
  window._planData = { data, bmi, bmiCat, targets, macros, plan, ex };
}

/* ── Diet Tabs ── */
function renderDietTabs(plan) {
  const tabsEl   = document.getElementById('dietTabs');
  const contentEl = document.getElementById('dietContent');

  tabsEl.innerHTML = '';
  contentEl.innerHTML = '';

  plan.forEach((dayPlan, i) => {
    // Tab button
    const btn = document.createElement('button');
    btn.className = `diet-tab${i === 0 ? ' active' : ''}`;
    btn.textContent = dayPlan.day.slice(0, 3);
    btn.dataset.day = i;
    btn.addEventListener('click', () => switchDietTab(i));
    tabsEl.appendChild(btn);

    // Day panel
    const panel = document.createElement('div');
    panel.className = `diet-day-panel${i !== 0 ? ' hidden' : ''}`;
    panel.id = `dayPanel-${i}`;
    panel.innerHTML = `
      <div class="meal-list">
        ${dayPlan.meals.map(m => `
          <div class="meal-item">
            <span class="meal-time">${m.time}</span>
            <span class="meal-name">${m.name}</span>
            <span class="meal-cal">${m.cal}</span>
          </div>
        `).join('')}
      </div>
    `;
    contentEl.appendChild(panel);
  });
}

function switchDietTab(index) {
  document.querySelectorAll('.diet-tab').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
  document.querySelectorAll('.diet-day-panel').forEach((p, i) => {
    p.classList.toggle('hidden', i !== index);
  });
}

/* ── Exercise Grid ── */
function renderExercise(days) {
  const badgeClass = { strength: 'badge-green', cardio: 'badge-blue', hiit: 'badge-green', recovery: 'badge-blue', rest: 'badge-gray' };
  const badgeLabel = { strength: 'Strength', cardio: 'Cardio', hiit: 'HIIT', recovery: 'Recovery', rest: 'Rest' };

  document.getElementById('exerciseGrid').innerHTML = days.map(d => `
    <div class="ex-day${d.badge === 'rest' ? ' rest-day' : ''}">
      <span class="ex-day-name">${d.day}</span>
      <span class="ex-icon">${d.icon}</span>
      <span class="ex-title">${d.title}</span>
      <span class="ex-detail">${d.detail.replace(/\n/g, '<br/>')}</span>
      <span class="ex-badge ${badgeClass[d.badge]}">${badgeLabel[d.badge]}</span>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════
   FORM SUBMIT
══════════════════════════════════════════ */
fitnessForm.addEventListener('submit', (e) => {
  e.preventDefault();

  /* Gather values */
  const age    = parseInt(document.getElementById('age').value);
  const height = parseInt(document.getElementById('height').value);
  const weight = parseInt(document.getElementById('weight').value);
  const gender = document.querySelector('input[name="gender"]:checked')?.value;
  const goal   = document.querySelector('input[name="goal"]:checked')?.value;
  const food   = document.querySelector('input[name="food"]:checked')?.value;
  const budget = document.querySelector('input[name="budget"]:checked')?.value;

  /* Validate */
  if (!age || !height || !weight || !gender || !goal || !food || !budget) {
    shakeForm();
    return;
  }
  if (age < 10 || age > 100)    { alert('Please enter a valid age (10–100).'); return; }
  if (height < 100 || height > 250) { alert('Please enter a valid height (100–250 cm).'); return; }
  if (weight < 30 || weight > 300)  { alert('Please enter a valid weight (30–300 kg).'); return; }

  const userData = { age, height, weight, gender, goal, food, budget };
  saveFormData(userData);

  /* Show loading */
  showLoading(() => {
    renderResults(userData);
    hideLoading();
    resultsSection.classList.remove('hidden');
    setTimeout(() => {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  });
});

/* Shake form on invalid */
function shakeForm() {
  fitnessForm.style.animation = 'none';
  fitnessForm.offsetHeight; // reflow
  fitnessForm.style.animation = 'shake 0.4s ease';
  fitnessForm.addEventListener('animationend', () => {
    fitnessForm.style.animation = '';
  }, { once: true });

  // Add shake keyframes if not present
  if (!document.getElementById('shakeKf')) {
    const style = document.createElement('style');
    style.id = 'shakeKf';
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        15%       { transform: translateX(-8px); }
        30%       { transform: translateX(8px); }
        45%       { transform: translateX(-6px); }
        60%       { transform: translateX(6px); }
        75%       { transform: translateX(-3px); }
        90%       { transform: translateX(3px); }
      }
    `;
    document.head.appendChild(style);
  }
}

/* ── Loading overlay helpers ── */
let _loadInterval;
function showLoading(callback) {
  loadingOverlay.classList.remove('hidden');
  let idx = 0;
  loadingText.textContent = LOADING_MSGS[0];
  _loadInterval = setInterval(() => {
    idx = (idx + 1) % LOADING_MSGS.length;
    loadingText.textContent = LOADING_MSGS[idx];
  }, 600);

  // Simulate processing time (2.2s)
  setTimeout(() => {
    clearInterval(_loadInterval);
    callback();
  }, 2200);
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

/* ══════════════════════════════════════════
   DOWNLOAD PLAN
══════════════════════════════════════════ */
downloadBtn.addEventListener('click', () => {
  if (!window._planData) return;
  const { data, bmi, bmiCat, targets, macros, plan, ex } = window._planData;

  let txt = '';
  txt += '═══════════════════════════════════════\n';
  txt += '       SMART FITNESS & DIET PLANNER     \n';
  txt += '           Your Personalised Plan        \n';
  txt += '═══════════════════════════════════════\n\n';

  txt += '── YOUR PROFILE ──────────────────────\n';
  txt += `Age:    ${data.age} years\n`;
  txt += `Gender: ${data.gender}\n`;
  txt += `Height: ${data.height} cm  |  Weight: ${data.weight} kg\n`;
  txt += `Goal:   ${data.goal === 'loss' ? 'Weight Loss' : data.goal === 'gain' ? 'Muscle Gain' : 'Maintain Weight'}\n`;
  txt += `Diet:   ${data.food === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}  |  Budget: ${data.budget}\n\n`;

  txt += '── BMI ANALYSIS ───────────────────────\n';
  txt += `BMI:    ${bmi}  (${bmiCat.label})\n\n`;

  txt += '── DAILY CALORIE TARGET ───────────────\n';
  txt += `Calories: ${targets.toLocaleString()} kcal/day\n`;
  txt += `Protein:  ${macros.protein}g  |  Carbs: ${macros.carbs}g  |  Fat: ${macros.fat}g\n\n`;

  txt += '── 7-DAY MEAL PLAN ────────────────────\n';
  plan.forEach(dayPlan => {
    txt += `\n${dayPlan.day.toUpperCase()}\n`;
    dayPlan.meals.forEach(m => {
      txt += `  ${m.time.padEnd(10)}: ${m.name}  (${m.cal})\n`;
    });
  });

  txt += '\n── WEEKLY WORKOUT ─────────────────────\n';
  ex.days.forEach(d => {
    txt += `  ${d.day}: ${d.title}  — ${d.detail.replace(/\n/g, ' ')}\n`;
  });

  txt += '\n── DIET NOTES ─────────────────────────\n';
  const dietNotes = {
    low:    '💸 LOW BUDGET: Cheap + healthy. Dal-roti-sabzi core. Soaked chana/peanuts for protein.\n   Good for maintenance & light weight loss.',
    medium: '💰 MEDIUM BUDGET: Better protein. Milk + paneer/eggs + curd.\n   Good for fitness + normal muscle maintenance.',
    high:   '💎 HIGH BUDGET: High protein focus. Oats + brown rice + paneer/chicken/fish.\n   Best for muscle gain / fat loss.',
  };
  txt += dietNotes[data.budget] + '\n';

  txt += '\n── DAILY ROUTINE NOTES ────────────────\n';
  txt += '🌅 Morning (10–15 min): Stretching · 10 Push-ups · 15 Squats · 20 Jumping Jacks\n';
  txt += '☀️ Afternoon: Normal daily work (college/office) + Walk 10–15 min\n';
  txt += '🌙 Evening (15–20 min): Push-ups (2 sets) · Squats (2 sets) · Plank 30s×2\n';
  txt += '🌿 Night: Light walk 5–10 min · Sleep before 11 PM\n';

  txt += '\n═══════════════════════════════════════\n';
  txt += 'Generated by FitPlan AI · Stay Consistent!\n';
  txt += '═══════════════════════════════════════\n';

  /* Trigger download */
  const blob = new Blob([txt], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'MyFitnessPlan.txt';
  a.click();
  URL.revokeObjectURL(url);
});