// api/index.js — v1, sélection dynamique du modèle, sortie JSON via prompt (sans generationConfig)

// Protection contre les chargements multiples du module (Railway/Serverless)
if (global.appInstance) {
  console.log('⚠️ Module api/index.js déjà chargé, réutilisation de l\'instance existante');
  module.exports = global.appInstance;
  return;
}

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const archiver = require('archiver');
const webpush = require('web-push');
const path = require('path');
// ========================================================================
// ====================== AIDES POUR GÉNÉRATION WORD ======================
// ========================================================================

const xmlEscape = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
};

const containsArabic = (text) => {
  if (typeof text !== 'string') return false;
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
};

const formatTextForWord = (text, options = {}) => {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return '<w:p/>';
  }
  
  // Nettoyer le texte : supprimer les espaces/sauts de ligne avant et après
  const cleanedText = text.trim();
  
  const { color, italic } = options;
  const runPropertiesParts = [];
  runPropertiesParts.push('<w:sz w:val="22"/><w:szCs w:val="22"/>');
  if (color) runPropertiesParts.push(`<w:color w:val="${color}"/>`);
  if (italic) runPropertiesParts.push('<w:i/><w:iCs w:val="true"/>');

  let paragraphProperties = '';
  if (containsArabic(cleanedText)) {
    // Pour le texte arabe : RTL + centré
    paragraphProperties = '<w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr>';
    runPropertiesParts.push('<w:rtl/>');
  }

  const runProperties = `<w:rPr>${runPropertiesParts.join('')}</w:rPr>`;
  
  // Conserver uniquement les sauts de ligne intentionnels de l'enseignant
  const lines = cleanedText.split(/\r\n|\n|\r/);
  const content = lines
    .map(line => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`)
    .join('<w:br/>');
  return `<w:p>${paragraphProperties}<w:r>${runProperties}${content}</w:r></w:p>`;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());
// --- CONFIGURATION POUR LE FRONTEND ---
// On définit le chemin vers le dossier public (qui est un dossier parent à 'api')
const publicPath = path.join(__dirname, '..', 'public');

// 1. On dit à Express de rendre accessibles les fichiers statiques (CSS, JS, Images)
app.use(express.static(publicPath));

// 2. Route pour la page d'accueil (Health Check de Railway)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 3. Route de secours pour le diagnostic (optionnel)
app.get('/diagnostic', (req, res) => {
  res.sendFile(path.join(publicPath, 'diagnostic.html'));
});
// --------------------------------------
const MONGO_URL = process.env.MONGO_URL;
const WORD_TEMPLATE_URL = process.env.WORD_TEMPLATE_URL;
const LESSON_TEMPLATE_URL = process.env.LESSON_TEMPLATE_URL;

// Configuration IA Providers - Pool de clés Gemini avec rotation automatique
// ⚠️ SÉCURITÉ : Les clés API DOIVENT être définies dans les variables d'environnement Vercel
// Ne JAMAIS mettre de vraies clés API dans le code source (risque de leak sur GitHub)
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(key => key && key.length > 30); // Filtrer les clés vides ou invalides (clés Gemini = 39 chars)

// Valider qu'au moins une clé est disponible
if (GEMINI_API_KEYS.length === 0) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ ERREUR CRITIQUE: Aucune clé API Gemini valide configurée !');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('📋 ÉTAPES POUR RÉSOUDRE :');
  console.error('');
  console.error('1️⃣  Créez 4 nouvelles clés API sur: https://aistudio.google.com/apikey');
  console.error('    (Utilisez 4 projets Google Cloud différents pour plus de quota)');
  console.error('');
  console.error('2️⃣  Sur Vercel, allez dans Settings → Environment Variables');
  console.error('');
  console.error('3️⃣  Ajoutez ces 4 variables (avec VOS nouvelles clés) :');
  console.error('    • GEMINI_API_KEY_1 = votre_nouvelle_clé_1');
  console.error('    • GEMINI_API_KEY_2 = votre_nouvelle_clé_2');
  console.error('    • GEMINI_API_KEY_3 = votre_nouvelle_clé_3');
  console.error('    • GEMINI_API_KEY_4 = votre_nouvelle_clé_4');
  console.error('');
  console.error('4️⃣  Redéployez le projet (Deployments → Redeploy)');
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('');
  console.error('⚠️  Le serveur va démarrer mais la génération de plans IA échouera.');
  console.error('');
} else {
  console.log(`✅ ${GEMINI_API_KEYS.length} clé(s) API Gemini valide(s) configurée(s)`);
  // Masquer les clés dans les logs (afficher seulement les 8 premiers et 4 derniers caractères)
  GEMINI_API_KEYS.forEach((key, index) => {
    const masked = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    console.log(`   Clé ${index + 1}: ${masked}`);
  });
}

// Ancienne configuration (conservée pour compatibilité)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_GROQ = false; // Désactivé, on utilise le pool Gemini
const AI_API_KEY = GEMINI_API_KEYS[0]; // Première clé par défaut

// Configuration Web Push (VAPID)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDuAoL4lagqZmYl4BPdCFYBwRhoqGMrcWUFAbF1pMBWq2e0JOV6fL_WitURlXXhXTROGB2vYpnvgSDZfAoZq0Jo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'TVK1zF6o5s-SK3OQnGCMgu4KZCNxg3py4YA4sMqtItg';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@plan-hebdomadaire.com';

// Configuration de web-push avec les clés VAPID
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push VAPID configuré');
} else {
  console.warn('⚠️ Clés VAPID manquantes - notifications push désactivées');
}

const arabicTeachers = ['Nidaa', 'Dina', 'Amal Najar', 'Abeer', 'Fatima Zahrani'];
const englishTeachers = ['Amal', 'Hana'];
const frenchTeachers = ['Nour', 'Fatima', 'Nesrine', 'Rommana', 'Rayan'];

const specificWeekDateRangesNode = {
  1:{start:'2025-08-31',end:'2025-09-04'}, 2:{start:'2025-09-07',end:'2025-09-11'}, 3:{start:'2025-09-14',end:'2025-09-18'}, 4:{start:'2025-09-21',end:'2025-09-25'}, 5:{start:'2025-09-28',end:'2025-10-02'}, 6:{start:'2025-10-05',end:'2025-10-09'}, 7:{start:'2025-10-12',end:'2025-10-16'}, 8:{start:'2025-10-19',end:'2025-10-23'}, 9:{start:'2025-10-26',end:'2025-10-30'},10:{start:'2025-11-02',end:'2025-11-06'},
  11:{start:'2025-11-09',end:'2025-11-13'},12:{start:'2025-11-16',end:'2025-11-20'}, 13:{start:'2025-11-23',end:'2025-11-27'},14:{start:'2025-11-30',end:'2025-12-04'}, 15:{start:'2025-12-07',end:'2025-12-11'},16:{start:'2025-12-14',end:'2025-12-18'}, 17:{start:'2025-12-21',end:'2025-12-25'},18:{start:'2025-12-28',end:'2026-01-01'}, 19:{start:'2026-01-04',end:'2026-01-08'},20:{start:'2026-01-18',end:'2026-01-22'},
  21:{start:'2026-01-25',end:'2026-01-29'},22:{start:'2026-02-01',end:'2026-02-05'}, 23:{start:'2026-02-08',end:'2026-02-12'},24:{start:'2026-02-15',end:'2026-02-19'}, 25:{start:'2026-02-22',end:'2026-02-26'},26:{start:'2026-03-01',end:'2026-03-05'}, 27:{start:'2026-03-29',end:'2026-04-02'},28:{start:'2026-04-05',end:'2026-04-09'}, 29:{start:'2026-04-12',end:'2026-04-16'},30:{start:'2026-04-19',end:'2026-04-23'},
  31:{start:'2026-04-26',end:'2026-04-30'}
};

const validUsers = {
  "Mohamed": "Mohamed",
  "Nour": "Nour", "Fatima": "Fatima", "Nesrine": "Nesrine", "Rommana": "Rommana", "Rayan": "Rayan",
  "Amal": "Amal", "Hana": "Hana",
  "Nidaa": "Nidaa", "Dina": "Dina", "Amal Najar": "Amal Najar", "Abeer": "Abeer", "Fatima Zahrani": "Fatima Zahrani"
};

let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();
  cachedDb = db;
  return db;
}

function formatDateFrenchNode(date) {
  if (!date || isNaN(date.getTime())) return "Date invalide";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayName = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const monthName = months[date.getUTCMonth()];
  const yearNum = date.getUTCFullYear();
  return `${dayName} ${dayNum} ${monthName} ${yearNum}`;
}
function extractDayNameFromString(dayString) {
  if (!dayString || typeof dayString !== 'string') return null;
  const trimmed = dayString.trim();
  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
  
  // Check if it's already just a day name
  if (dayNames.includes(trimmed)) {
    return trimmed;
  }
  
  // Extract day name from formatted date (e.g., "Dimanche 07 Décembre 2025")
  for (const dayName of dayNames) {
    if (trimmed.startsWith(dayName)) {
      return dayName;
    }
  }
  
  return null;
}

function getDateForDayNameNode(weekStartDate, dayName) {
  if (!weekStartDate || isNaN(weekStartDate.getTime())) return null;
  const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 };
  const offset = dayOrder[dayName];
  if (offset === undefined) return null;
  const specificDate = new Date(Date.UTC(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth(),
    weekStartDate.getUTCDate()
  ));
  specificDate.setUTCDate(specificDate.getUTCDate() + offset);
  return specificDate;
}
const findKey = (obj, target) => obj ? Object.keys(obj).find(k => k.trim().toLowerCase() === target.toLowerCase()) : undefined;

// ======================= Fonction utilitaire pour les noms de fichiers ==
const sanitizeForFilename = (str) => {
  if (typeof str !== 'string') str = String(str);
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/__+/g, '_');
};

// ======================= Sélection dynamique du modèle ==================

/**
 * Liste les modèles disponibles via l'API v1 et retourne le premier modèle
 * correspondant à la liste de préférence ET supportant generateContent.
 *
 * On gère les changements de noms (EoL des 1.5, arrivée des 2.5, etc.).
 */
async function resolveGeminiModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Impossible de lister les modèles (HTTP ${resp.status}) ${body}`);
  }
  const json = await resp.json();
  const models = Array.isArray(json.models) ? json.models : [];

  // Préférence (ordre décroissant) – ajuste si besoin selon tes coûts/perf
  const preferredNames = [
    // Généraux actuels
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    // Anciennes séries (si encore exposées pour ta clé)
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-002",
    "gemini-1.5-flash"
  ];

  const nameSet = new Map(models.map(m => [m.name, m]));
  // Cherche d'abord dans les préférés
  for (const short of preferredNames) {
    const full = `models/${short}`;
    const m = nameSet.get(full);
    if (m && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent")) {
      return short;
    }
  }
  // Sinon, prends le premier qui supporte generateContent
  const any = models.find(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
  if (any) return any.name.replace(/^models\//, "");

  throw new Error("Aucun modèle compatible v1 trouvé pour votre clé (generateContent). Vérifiez l'accès de la clé et l'API activée.");
}

/**
 * Fonction pour appeler l'API Gemini avec rotation automatique des clés
 * Essaie toutes les clés disponibles jusqu'à ce qu'une fonctionne
 * @param {string} prompt - Le prompt à envoyer à l'IA
 * @returns {Promise<{success: boolean, data: any, provider: string, error?: string}>}
 */
async function callGeminiWithFallback(prompt) {
  let lastError = null;
  
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const apiKey = GEMINI_API_KEYS[i];
    const keyNumber = i + 1;
    
    try {
      console.log(`🤖 [Gemini] Tentative ${keyNumber}/${GEMINI_API_KEYS.length} avec API${keyNumber}`);
      
      // Résoudre le modèle pour cette clé
      const MODEL_NAME = await resolveGeminiModel(apiKey);
      console.log(`✅ [Gemini] Modèle sélectionné: ${MODEL_NAME} (clé ${keyNumber})`);
      
      const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40
        }
      };
      
      console.log(`🔄 [Gemini] Appel API avec clé ${keyNumber}...`);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45000) // Timeout de 45 secondes
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ [Gemini] Succès avec API${keyNumber}`);
        return {
          success: true,
          data: data,
          provider: `Gemini API${keyNumber}`,
          modelUsed: MODEL_NAME
        };
      } else if (response.status === 429) {
        // Quota épuisé, essayer la clé suivante
        const errorBody = await response.json().catch(() => ({}));
        console.warn(`⚠️ [Gemini] Quota épuisé pour API${keyNumber}, essai clé suivante...`);
        lastError = new Error(`Quota Gemini API${keyNumber} épuisé - Réessayez demain ou utilisez une autre clé`);
        continue;
      } else if (response.status === 403) {
        // Clé compromise ou invalide
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = errorBody.error?.message || 'Permission denied';
        
        if (errorMsg.includes('leaked') || errorMsg.includes('reported')) {
          console.error(`🔴 [Gemini] CLÉ API${keyNumber} COMPROMISE/LEAKÉE ! Remplacez-la immédiatement.`);
          console.error(`   Message: ${errorMsg}`);
          lastError = new Error(`Clé API${keyNumber} compromise - Créez une nouvelle clé sur https://aistudio.google.com/apikey`);
        } else {
          console.error(`❌ [Gemini] Accès refusé pour API${keyNumber}: ${errorMsg}`);
          lastError = new Error(`Clé API${keyNumber} invalide ou permissions insuffisantes`);
        }
        continue;
      } else {
        // Autre erreur, essayer la clé suivante
        const errorBody = await response.json().catch(() => ({}));
        console.error(`❌ [Gemini] Erreur API${keyNumber}:`, response.status, errorBody);
        lastError = new Error(errorBody.error?.message || `Erreur Gemini ${response.status}`);
        continue;
      }
    } catch (error) {
      console.error(`❌ [Gemini] Exception API${keyNumber}:`, error.message);
      lastError = error;
      continue;
    }
  }
  
  // Si aucune clé n'a fonctionné
  console.error(`❌ [Gemini] Toutes les ${GEMINI_API_KEYS.length} clés ont échoué`);
  return {
    success: false,
    error: lastError?.message || 'Toutes les clés API Gemini ont échoué',
    provider: 'None'
  };
}

// ------------------------- Web Push Subscriptions -------------------------

app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = req.body.subscription;
    const username = req.body.username;
    if (!subscription || !username) {
      return res.status(400).json({ message: 'Subscription et username requis.' });
    }

    const db = await connectToDatabase();
    // Utiliser l'endpoint comme _id pour garantir l'unicité de l'abonnement
    await db.collection('subscriptions').updateOne(
      { _id: subscription.endpoint },
      { $set: { subscription: subscription, username: username, createdAt: new Date() } },
      { upsert: true }
    );

    res.status(201).json({ message: 'Abonnement enregistré.' });
  } catch (error) {
    console.error('Erreur MongoDB /subscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('subscriptions').deleteOne({ _id: endpoint });

    res.status(200).json({ message: 'Abonnement supprimé.' });
  } catch (error) {
    console.error('Erreur MongoDB /unsubscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ------------------------- Rappels Automatiques (Cron) -------------------------

// Fonction utilitaire pour déterminer la semaine actuelle
function getCurrentWeekNumber() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Utiliser UTC pour la comparaison avec les dates stockées

  for (const week in specificWeekDateRangesNode) {
    const dates = specificWeekDateRangesNode[week];
    const startDate = new Date(dates.start + 'T00:00:00Z');
    const endDate = new Date(dates.end + 'T00:00:00Z');

    // Ajouter un jour à la date de fin pour inclure le dernier jour
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    if (today >= startDate && today <= endDate) {
      return parseInt(week, 10);
    }
  }
  return null; // Semaine non trouvée
}

app.get('/api/send-reminders', async (req, res) => {
  try {
    const weekNumber = getCurrentWeekNumber();
    if (!weekNumber) {
      console.log('⚠️ Semaine actuelle non définie dans la configuration.');
      return res.status(200).json({ message: 'Semaine actuelle non définie.' });
    }

    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });

    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      console.log(`⚠️ Aucun plan trouvé pour la semaine ${weekNumber}.`);
      return res.status(200).json({ message: `Aucun plan trouvé pour la semaine ${weekNumber}.` });
    }

    // 1. Identifier les enseignants avec au moins une leçon vide
    const teachersToRemind = new Set();
    const leconKey = findKey(planDocument.data[0] || {}, 'Leçon');

    if (leconKey) {
      planDocument.data.forEach(row => {
        const enseignantKey = findKey(row, 'Enseignant');
        const enseignant = enseignantKey ? row[enseignantKey] : null;
        const lecon = row[leconKey];

        // Si l'enseignant est valide et la leçon est vide ou non définie
        if (enseignant && (!lecon || lecon.trim() === '')) {
          teachersToRemind.add(enseignant);
        }
      });
    }

    if (teachersToRemind.size === 0) {
      console.log(`✅ Tous les plans de la semaine ${weekNumber} semblent complets.`);
      return res.status(200).json({ message: 'Tous les plans sont complets. Aucun rappel envoyé.' });
    }

    console.log(`🔔 Enseignants à rappeler pour S${weekNumber}:`, Array.from(teachersToRemind));

    // 2. Récupérer les abonnements pour ces enseignants
    const subscriptions = await db.collection('subscriptions').find({
      username: { $in: Array.from(teachersToRemind) }
    }).toArray();

    if (subscriptions.length === 0) {
      console.log('⚠️ Aucun abonnement push trouvé pour les enseignants à rappeler.');
      return res.status(200).json({ message: 'Aucun abonnement push trouvé.' });
    }

    // 3. Envoyer les notifications
    const notificationPayload = JSON.stringify({
      title: 'Rappel Plan Hebdomadaire',
      body: `Veuillez compléter votre plan de leçon pour la semaine ${weekNumber}.`,
      icon: '/icons/icon-192x192.png', // Assurez-vous que cette icône existe
      data: {
        url: '/', // URL à ouvrir lors du clic sur la notification
        week: weekNumber
      }
    });

    const sendPromises = subscriptions.map(sub => {
      return webpush.sendNotification(sub.subscription, notificationPayload)
        .then(() => console.log(`Notification envoyée à ${sub.username}`))
        .catch(async (error) => {
          console.error(`Échec envoi notification à ${sub.username}:`, error);
          // Supprimer l'abonnement si l'erreur est 410 Gone (abonnement expiré)
          if (error.statusCode === 410) {
            await db.collection('subscriptions').deleteOne({ _id: sub.subscription.endpoint });
            console.log(`Abonnement expiré pour ${sub.username} supprimé.`);
          }
        });
    });

    await Promise.allSettled(sendPromises);

    res.status(200).json({ 
      message: `${sendPromises.length} rappels tentés.`,
      teachersReminded: Array.from(teachersToRemind)
    });

  } catch (error) {
    console.error('❌ Erreur serveur /send-reminders:', error);
    res.status(500).json({ message: 'Erreur interne /send-reminders.' });
  }
});

// ------------------------- Auth & CRUD simples -------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongoConfigured: !!MONGO_URL,
    geminiConfigured: !!GEMINI_API_KEY
  });
});

app.post('/api/login', (req, res) => {
  try {
    console.log('[LOGIN] Requête reçue de:', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    const { username, password } = req.body;
    console.log('[LOGIN] Tentative pour utilisateur:', username);
    
    if (!username || !password) {
      console.log('[LOGIN] Username ou password manquant');
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    if (validUsers[username] && validUsers[username] === password) {
      console.log('[LOGIN] Authentification réussie pour:', username);
      res.status(200).json({ success: true, username: username });
    } else {
      console.log('[LOGIN] Échec authentification pour:', username);
      res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }
  } catch (error) {
    console.error('[LOGIN] CRASH in /api/login:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
  }
});

app.get('/api/plans/:week', async (req, res) => {
  const weekNumber = parseInt(req.params.week, 10);
  if (isNaN(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });
  try {
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });
    
    if (planDocument) {
      // Récupérer tous les plans de leçon disponibles pour cette semaine
      const lessonPlans = await db.collection('lessonPlans')
        .find({ week: weekNumber }, { projection: { _id: 1 } })
        .toArray();
      
      // Créer un Set des IDs disponibles pour recherche rapide
      const availableLessonPlanIds = new Set(lessonPlans.map(lp => lp._id));
      
      // NEW LOGIC: Check for available weekly DOCX plans
      const weeklyPlans = await db.collection('weeklyLessonPlans')
        .find({ week: weekNumber }, { projection: { classe: 1 } })
        .toArray();
      
      const availableWeeklyPlans = weeklyPlans.map(p => p.classe); // Array of class names
      
      // Enrichir les données avec lessonPlanId si disponible
      console.log(`📋 Plans disponibles pour S${weekNumber}:`, Array.from(availableLessonPlanIds));
      
      const enrichedData = (planDocument.data || []).map(row => {
        const enseignant = row[findKey(row, 'Enseignant')] || '';
        const classe = row[findKey(row, 'Classe')] || '';
        const matiere = row[findKey(row, 'Matière')] || '';
        const periode = row[findKey(row, 'Période')] || '';
        const jour = row[findKey(row, 'Jour')] || '';
        
        const potentialLessonPlanId = `${weekNumber}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
        
        if (availableLessonPlanIds.has(potentialLessonPlanId)) {
          console.log(`✅ lessonPlanId trouvé: ${potentialLessonPlanId}`);
          return { ...row, lessonPlanId: potentialLessonPlanId };
        } else {
          console.log(`⚠️ lessonPlanId non trouvé: ${potentialLessonPlanId}`);
        }
        return row;
      });
      
      res.status(200).json({ 
          planData: enrichedData, 
          classNotes: planDocument.classNotes || {},
          availableWeeklyPlans: availableWeeklyPlans // NEW FIELD
      });
    } else {
      res.status(200).json({ planData: [], classNotes: {}, availableWeeklyPlans: [] }); // NEW FIELD
    }
  } catch (error) {
    console.error('Erreur MongoDB /plans/:week:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-plan', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const data = req.body.data;
  if (isNaN(weekNumber) || !Array.isArray(data)) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    await db.collection('plans').updateOne(
      { week: weekNumber },
      { $set: { data: data } },
      { upsert: true }
    );
    res.status(200).json({ message: `Plan S${weekNumber} enregistré.` });
  } catch (error) {
    console.error('Erreur MongoDB /save-plan:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-notes', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const { classe, notes } = req.body;
  if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    await db.collection('plans').updateOne(
      { week: weekNumber },
      { $set: { [`classNotes.${classe}`]: notes } },
      { upsert: true }
    );
    res.status(200).json({ message: 'Notes enregistrées.' });
  } catch (error) {
    console.error('Erreur MongoDB /save-notes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-row', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const rowData = req.body.data;
  if (isNaN(weekNumber) || typeof rowData !== 'object') return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const updateFields = {};
    const now = new Date();
    for (const key in rowData) {
      updateFields[`data.$[elem].${key}`] = rowData[key];
    }
    updateFields['data.$[elem].updatedAt'] = now;

    const arrayFilters = [{
      "elem.Enseignant": rowData[findKey(rowData, 'Enseignant')],
      "elem.Classe": rowData[findKey(rowData, 'Classe')],
      "elem.Jour": rowData[findKey(rowData, 'Jour')],
      "elem.Période": rowData[findKey(rowData, 'Période')],
      "elem.Matière": rowData[findKey(rowData, 'Matière')]
    }];

    const result = await db.collection('plans').updateOne(
      { week: weekNumber },
      { $set: updateFields },
      { arrayFilters: arrayFilters }
    );

    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      res.status(200).json({ message: 'Ligne enregistrée.', updatedData: { updatedAt: now } });
    } else {
      res.status(404).json({ message: 'Ligne non trouvée.' });
    }
  } catch (error) {
    console.error('Erreur MongoDB /save-row:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Correction MongoDB ($ne dupliqué → $nin)
app.get('/api/all-classes', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const classes = await db.collection('plans').distinct('data.Classe', { 'data.Classe': { $nin: [null, ""] } });
    res.status(200).json((classes || []).sort());
  } catch (error) {
    console.error('Erreur MongoDB /api/all-classes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// --------------------- Génération Word (plan hebdo) ---------------------

app.post('/api/generate-word', async (req, res) => {
  try {
    const { week, classe, data, notes } = req.body;
    const weekNumber = Number(week);
    if (!Number.isInteger(weekNumber) || !classe || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Données invalides.' });
    }

    let templateBuffer;
    try {
      const response = await fetch(WORD_TEMPLATE_URL);
      if (!response.ok) throw new Error(`Échec modèle Word (${response.status})`);
      templateBuffer = Buffer.from(await response.arrayBuffer());
    } catch (e) {
      console.error("Erreur de récupération du modèle Word:", e);
      return res.status(500).json({ message: `Erreur récup modèle Word.` });
    }

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      nullGetter: () => "",
    });

    const groupedByDay = {};
    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const datesNode = specificWeekDateRangesNode[weekNumber];
    let weekStartDateNode = null;
    if (datesNode?.start) {
      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
    }
    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
    }

    const sampleRow = data[0] || {};
    const jourKey = findKey(sampleRow, 'Jour'),
          periodeKey = findKey(sampleRow, 'Période'),
          matiereKey = findKey(sampleRow, 'Matière'),
          leconKey = findKey(sampleRow, 'Leçon'),
          travauxKey = findKey(sampleRow, 'Travaux de classe'),
          supportKey = findKey(sampleRow, 'Support'),
          devoirsKey = findKey(sampleRow, 'Devoirs');

    data.forEach(item => {
      const day = item[jourKey];
      if (day && dayOrder.includes(day)) {
        if (!groupedByDay[day]) groupedByDay[day] = [];
        groupedByDay[day].push(item);
      }
    });

    const joursData = dayOrder.map(dayName => {
      if (!groupedByDay[dayName]) return null;

      const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
      const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
      const sortedEntries = groupedByDay[dayName].sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));

      const matieres = sortedEntries.map(item => ({
        matiere: item[matiereKey] ?? "",
        Lecon: formatTextForWord(item[leconKey], { color: 'FF0000' }),
        travailDeClasse: formatTextForWord(item[travauxKey]),
        Support: formatTextForWord(item[supportKey], { color: 'FF0000', italic: true }),
        devoirs: formatTextForWord(item[devoirsKey], { color: '0000FF', italic: true })
      }));

      return { jourDateComplete: formattedDate, matieres: matieres };
    }).filter(Boolean);

    let plageSemaineText = `Semaine ${weekNumber}`;
    if (datesNode?.start && datesNode?.end) {
      const startD = new Date(datesNode.start + 'T00:00:00Z');
      const endD = new Date(datesNode.end + 'T00:00:00Z');
      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
      }
    }

    const templateData = {
      semaine: weekNumber,
      classe: classe,
      jours: joursData,
      notes: formatTextForWord(notes),
      plageSemaine: plageSemaineText
    };

    doc.render(templateData);

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const filename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

    // 1. Enregistrement du plan de leçon dans MongoDB
    try {
      const db = await connectToDatabase();
      const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
      
      await db.collection('weeklyLessonPlans').updateOne(
          { _id: lessonPlanId },
          { 
              $set: { 
                  week: weekNumber, 
                  classe: classe, 
                  filename: filename, 
                  fileData: buf, 
                  updatedAt: new Date() 
              },
              $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
      );
      console.log(`✅ Plan de leçon ${lessonPlanId} enregistré dans MongoDB.`);
    } catch (dbError) {
      console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
      // On continue pour envoyer le fichier même en cas d'échec de l'enregistrement
    }
    // Fin 1. Enregistrement du plan de leçon dans MongoDB
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);

  } catch (error) {
    console.error('❌ Erreur serveur /generate-word:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur interne /generate-word.' });
    }
	  }
	});

	// --------------------- Génération ZIP (Plans de Leçon Multiples) ---------------------

	app.post('/api/generate-weekly-plans-zip', async (req, res) => {
	  try {
	    const { week, classes, data, notes } = req.body;
	    const weekNumber = Number(week);
	    if (!Number.isInteger(weekNumber) || !Array.isArray(classes) || !Array.isArray(data)) {
	      return res.status(400).json({ message: 'Données invalides (semaine, classes ou data manquantes).' });
	    }

	    // Configuration du ZIP
	    const archive = archiver('zip', { zlib: { level: 9 } });
	    const filename = `Plans_Hebdomadaires_S${weekNumber}_${classes.length}_Classes.zip`;

	    res.setHeader('Content-Type', 'application/zip');
	    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
	    archive.pipe(res);

	    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
	    const datesNode = specificWeekDateRangesNode[weekNumber];
	    let weekStartDateNode = null;
	    if (datesNode?.start) {
	      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
	    }
	    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
	      archive.abort();
	      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
	    }

	    let templateBuffer;
	    try {
	      const response = await fetch(WORD_TEMPLATE_URL);
	      if (!response.ok) throw new Error(`Échec modèle Word (${response.status})`);
	      templateBuffer = Buffer.from(await response.arrayBuffer());
	    } catch (e) {
	      console.error("Erreur de récupération du modèle Word:", e);
	      archive.abort();
	      return res.status(500).json({ message: `Erreur récup modèle Word.` });
	    }

	    let plageSemaineText = `Semaine ${weekNumber}`;
	    if (datesNode?.start && datesNode?.end) {
	      const startD = new Date(datesNode.start + 'T00:00:00Z');
	      const endD = new Date(datesNode.end + 'T00:00:00Z');
	      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
	        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
	      }
	    }

	    const sampleRow = data[0] || {};
	    const jourKey = findKey(sampleRow, 'Jour'),
	          periodeKey = findKey(sampleRow, 'Période'),
	          matiereKey = findKey(sampleRow, 'Matière'),
	          leconKey = findKey(sampleRow, 'Leçon'),
	          travauxKey = findKey(sampleRow, 'Travaux de classe'),
	          supportKey = findKey(sampleRow, 'Support'),
	          devoirsKey = findKey(sampleRow, 'Devoirs');

	    for (const classe of classes) {
	      const classData = data.filter(item => item[findKey(item, 'Classe')] === classe);
	      const classNotes = notes[classe] || '';

	      if (classData.length === 0) {
	        console.warn(`Aucune donnée trouvée pour la classe ${classe}. Sautée.`);
	        continue;
	      }

	      const groupedByDay = {};
	      classData.forEach(item => {
	        const day = item[jourKey];
	        if (day && dayOrder.includes(day)) {
	          if (!groupedByDay[day]) groupedByDay[day] = [];
	          groupedByDay[day].push(item);
	        }
	      });

	      const joursData = dayOrder.map(dayName => {
	        if (!groupedByDay[dayName]) return null;

	        const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
	        const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
	        const sortedEntries = groupedByDay[dayName].sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));

	        const matieres = sortedEntries.map(item => ({
	          matiere: item[matiereKey] ?? "",
	          Lecon: formatTextForWord(item[leconKey], { color: 'FF0000' }),
	          travailDeClasse: formatTextForWord(item[travauxKey]),
	          Support: formatTextForWord(item[supportKey], { color: 'FF0000', italic: true }),
	          devoirs: formatTextForWord(item[devoirsKey], { color: '0000FF', italic: true })
	        }));

	        return { jourDateComplete: formattedDate, matieres: matieres };
	      }).filter(Boolean);

	      const templateData = {
	        semaine: weekNumber,
	        classe: classe,
	        jours: joursData,
	        notes: formatTextForWord(classNotes),
	        plageSemaine: plageSemaineText
	      };

	      // Créer une nouvelle instance de Docxtemplater pour chaque classe
	      const zip = new PizZip(templateBuffer);
	      const doc = new Docxtemplater(zip, {
	        paragraphLoop: true,
	        nullGetter: () => "",
	      });

	      doc.render(templateData);

	      const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
	      const docxFilename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

	      // Enregistrement du plan de leçon dans MongoDB (comme dans /api/generate-word)
	      try {
	        const db = await connectToDatabase();
	        const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	        
	        await db.collection('weeklyLessonPlans').updateOne(
	            { _id: lessonPlanId },
	            { 
	                $set: { 
	                    week: weekNumber, 
	                    classe: classe, 
	                    filename: docxFilename, 
	                    fileData: buf, 
	                    updatedAt: new Date() 
	                },
	                $setOnInsert: { createdAt: new Date() }
	            },
	            { upsert: true }
	        );
	        console.log(`✅ Plan de leçon ${lessonPlanId} enregistré dans MongoDB.`);
	      } catch (dbError) {
	        console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
	      }
	      
	      // Ajouter le DOCX au ZIP
	      archive.append(buf, { name: docxFilename });
	    }

	    archive.finalize();

	  } catch (error) {
	    console.error('❌ Erreur serveur /generate-weekly-plans-zip:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /generate-weekly-plans-zip.' });
	    }
	  }
	});

	// --------------------- Téléchargement Plan de Leçon (DOCX) ---------------------

	app.get('/api/download-weekly-plan/:week/:classe', async (req, res) => {
	  try {
	    const weekNumber = Number(req.params.week);
	    const classe = req.params.classe;
	    if (!Number.isInteger(weekNumber) || !classe) {
	      return res.status(400).json({ message: 'Semaine ou classe invalide.' });
	    }

	    const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	    const db = await connectToDatabase();
	    const planDocument = await db.collection('weeklyLessonPlans').findOne({ _id: lessonPlanId });

	    if (!planDocument || !planDocument.fileData) {
	      console.log(`⚠️ Plan de leçon non trouvé pour ${lessonPlanId}`);
	      return res.status(404).json({ message: 'Plan de leçon non généré ou non trouvé.' });
	    }

	    console.log(`✅ Plan de leçon trouvé pour ${lessonPlanId}. Envoi du fichier.`);
	    res.setHeader('Content-Disposition', `attachment; filename="${planDocument.filename}"`);
	    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	    res.send(planDocument.fileData.buffer); // fileData est un BSON Binary, on utilise .buffer pour le Buffer Node.js

	  } catch (error) {
	    console.error('❌ Erreur serveur /download-weekly-plan:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /download-weekly-plan.' });
	    }
	  }
	});

	// --------------------- Génération Excel (workbook) ---------------------

app.post('/api/generate-excel-workbook', async (req, res) => {
  try {
    const weekNumber = Number(req.body.week);
    if (!Number.isInteger(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });

    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });
    if (!planDocument?.data?.length) return res.status(404).json({ message: `Aucune donnée pour S${weekNumber}.` });

    const finalHeaders = [ 'Enseignant', 'Jour', 'Période', 'Classe', 'Matière', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs' ];
    const formattedData = planDocument.data.map(item => {
      const row = {};
      finalHeaders.forEach(header => {
        const itemKey = findKey(item, header);
        row[header] = itemKey ? item[itemKey] : '';
      });
      return row;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formattedData, { header: finalHeaders });
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 20 },
      { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, `Plan S${weekNumber}`);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Plan_Hebdomadaire_S${weekNumber}_Complet.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Erreur serveur /generate-excel-workbook:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne Excel.' });
  }
});

// --------------- Rapport Excel par classe (toutes semaines) ------------

app.post('/api/full-report-by-class', async (req, res) => {
  try {
    const { classe: requestedClass } = req.body;
    if (!requestedClass) return res.status(400).json({ message: 'Classe requise.' });

    const db = await connectToDatabase();
    const allPlans = await db.collection('plans').find({}).sort({ week: 1 }).toArray();
    if (!allPlans || allPlans.length === 0) return res.status(404).json({ message: 'Aucune donnée.' });

    const dataBySubject = {};
    const monthsFrench = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    allPlans.forEach(plan => {
      const weekNumber = plan.week;
      let monthName = 'N/A';
      const weekDates = specificWeekDateRangesNode[weekNumber];
      if (weekDates?.start) {
        try {
          const startDate = new Date(weekDates.start + 'T00:00:00Z');
          monthName = monthsFrench[startDate.getUTCMonth()];
        } catch (e) {}
      }

      (plan.data || []).forEach(item => {
        const itemClassKey = findKey(item, 'classe');
        const itemSubjectKey = findKey(item, 'matière');
        if (itemClassKey && item[itemClassKey] === requestedClass && itemSubjectKey && item[itemSubjectKey]) {
          const subject = item[itemSubjectKey];
          if (!dataBySubject[subject]) dataBySubject[subject] = [];
          const row = {
            'Mois': monthName,
            'Semaine': weekNumber,
            'Période': item[findKey(item, 'période')] || '',
            'Leçon': item[findKey(item, 'leçon')] || '',
            'Travaux de classe': item[findKey(item, 'travaux de classe')] || '',
            'Support': item[findKey(item, 'support')] || '',
            'Devoirs': item[findKey(item, 'devoirs')] || ''
          };
          dataBySubject[subject].push(row);
        }
      });
    });

    const subjectsFound = Object.keys(dataBySubject);
    if (subjectsFound.length === 0) return res.status(404).json({ message: `Aucune donnée pour la classe '${requestedClass}'.` });

    const workbook = XLSX.utils.book_new();
    const headers = ['Mois', 'Semaine', 'Période', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs'];

    subjectsFound.sort().forEach(subject => {
      const safeSheetName = subject.substring(0, 30).replace(/[*?:/\\\[\]]/g, '_');
      const worksheet = XLSX.utils.json_to_sheet(dataBySubject[subject], { header: headers });
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 25 }, { wch: 40 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    });

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Rapport_Complet_${requestedClass.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Erreur serveur /full-report-by-class:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne du rapport.' });
  }
});

// --------------------- Génération IA (REST, v1, modèle dynamique) ------

app.post('/api/generate-ai-lesson-plan', async (req, res) => {
  try {
    console.log('📝 [AI Lesson Plan] Nouvelle demande de génération');
    
    // Vérifier qu'au moins une clé Gemini est disponible
    if (!GEMINI_API_KEYS || GEMINI_API_KEYS.length === 0) {
      console.error('❌ [AI Lesson Plan] Aucune clé API Gemini disponible');
      return res.status(503).json({ message: "Le service IA n'est pas initialisé. Vérifiez les clés API Gemini." });
    }
    
    console.log(`🔧 [AI Lesson Plan] ${GEMINI_API_KEYS.length} clé(s) Gemini disponible(s)`);

    const lessonTemplateUrl = process.env.LESSON_TEMPLATE_URL || LESSON_TEMPLATE_URL;
    if (!lessonTemplateUrl) {
      console.error('❌ [AI Lesson Plan] URL du template de leçon manquante');
      return res.status(503).json({ message: "L'URL du modèle de leçon Word n'est pas configurée." });
    }

    const { week, rowData } = req.body;
    if (!rowData || typeof rowData !== 'object' || !week) {
      console.error('❌ [AI Lesson Plan] Données invalides:', { week, hasRowData: !!rowData });
      return res.status(400).json({ message: "Les données de la ligne ou de la semaine sont manquantes." });
    }
    
    console.log(`✅ [AI Lesson Plan] Génération pour semaine ${week}`);

    // Charger le modèle Word
    let templateBuffer;
    try {
      const response = await fetch(lessonTemplateUrl);
      if (!response.ok) throw new Error(`Échec du téléchargement du modèle Word (${response.status})`);
      templateBuffer = Buffer.from(await response.arrayBuffer());
    } catch (e) {
      console.error("Erreur de récupération du modèle Word:", e);
      return res.status(500).json({ message: "Impossible de récupérer le modèle de leçon depuis l'URL fournie." });
    }

    // Extraire données
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const lecon = rowData[findKey(rowData, 'Leçon')] || '';
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    const seance = rowData[findKey(rowData, 'Période')] || '';
    const support = rowData[findKey(rowData, 'Support')] || 'Non spécifié';
    const travaux = rowData[findKey(rowData, 'Travaux de classe')] || 'Non spécifié';
    const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || 'Non spécifié';
    
    console.log(`📚 [AI Lesson Plan] Données: ${enseignant} | ${classe} | ${matiere} | ${lecon}`);
    
    // ⚡ VALIDATION: Vérifier qu'au moins UN des 4 champs pédagogiques est rempli (≥3 caractères)
    const leconTrimmed = lecon.trim();
    const travauxTrimmed = travaux !== 'Non spécifié' ? travaux.trim() : '';
    const supportTrimmed = support !== 'Non spécifié' ? support.trim() : '';
    const devoirsTrimmed = devoirsPrevus !== 'Non spécifié' ? devoirsPrevus.trim() : '';
    
    const hasContent = (leconTrimmed.length >= 3) || (travauxTrimmed.length >= 3) || (supportTrimmed.length >= 3) || (devoirsTrimmed.length >= 3);
    
    if (!hasContent) {
      console.log(`⏭️  [Single Plan] IGNORÉ (aucun contenu): ${enseignant} | ${classe} | ${matiere}`);
      return res.status(400).json({ 
        message: "Aucun contenu pédagogique trouvé. Au moins l'un des champs (Leçon, Travaux de classe, Support, Devoirs) doit être rempli (≥3 caractères)."
      });
    }
    
    console.log(`✓ [Single Plan] VALIDE (contenu détecté): ${enseignant} | ${classe} | ${matiere}`);

    // Date formatée
    let formattedDate = "";
    const weekNumber = Number(week);
    const datesNode = specificWeekDateRangesNode[weekNumber];
    if (jour && datesNode?.start) {
      const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
      if (!isNaN(weekStartDateNode.getTime())) {
        // Extract day name from the jour field (in case it contains a full date)
        const dayName = extractDayNameFromString(jour);
        if (dayName) {
          const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
          if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
        }
      }
    }

    // ========================================
    // 🔥 PROMPT OPTIMISÉ (identique au ZIP endpoint)
    // ========================================
    const cleanText = (text) => {
      if (!text) return 'Non spécifié';
      return text
        .replace(/"/g, "''")  // Remplacer " par ''
        .replace(/\\/g, '/')   // Remplacer \ par /
        .replace(/[\r\n]+/g, ' ') // Remplacer retours à la ligne
        .replace(/\s+/g, ' ')    // Normaliser espaces
        .trim();
    };
    
    const safeMatiere = cleanText(matiere);
    const safeClasse = cleanText(classe);
    const safeLecon = cleanText(lecon);
    const safeTravaux = cleanText(travaux);
    const safeSupport = cleanText(support);
    const safeDevoirsPrevus = cleanText(devoirsPrevus);

    let prompt;
    if (englishTeachers.includes(enseignant)) {
      prompt = `You are a JSON generator. Return ONLY a valid JSON object (no markdown, no code blocks, no extra text).

Create a 45-minute lesson plan with this EXACT structure:
{
  "TitreUnite": "relevant unit title",
  "Methodes": "teaching methods list",
  "Outils": "tools and materials list",
  "Objectifs": "learning objectives - one per line with dash prefix",
  "etapes": [
    {"phase": "Introduction", "duree": "5 min", "activite": "intro activity description"},
    {"phase": "Main Activity", "duree": "25 min", "activite": "main activity description"},
    {"phase": "Summary", "duree": "10 min", "activite": "summary activity"},
    {"phase": "Closing", "duree": "5 min", "activite": "closing and homework announcement"}
  ],
  "Ressources": "specific resources to use",
  "Devoirs": "homework suggestions",
  "DiffLents": "support for struggling learners",
  "DiffTresPerf": "challenges for high achievers",
  "DiffTous": "whole-class differentiation"
}

Lesson context:
- Subject: ${safeMatiere}
- Class: ${safeClasse}
- Topic: ${safeLecon}
- Planned classwork: ${safeTravaux}
- Materials: ${safeSupport}
- Homework: ${safeDevoirsPrevus}

IMPORTANT RULES:
1. Use only straight quotes (") for JSON structure
2. For text content, replace all quotes with apostrophes (')
3. Keep all text on single lines (no line breaks inside strings)
4. All keys must be exactly as shown
5. Return ONLY the JSON object, nothing else`;
    } else if (arabicTeachers.includes(enseignant)) {
      prompt = `أنت مولد JSON. أعد فقط كائن JSON صالح (بدون markdown، بدون كتل كود، بدون نص إضافي).

أنشئ خطة درس 45 دقيقة بهذا الهيكل الدقيق:
{
  "TitreUnite": "عنوان الوحدة",
  "Methodes": "قائمة طرق التدريس",
  "Outils": "قائمة الأدوات والمواد",
  "Objectifs": "الأهداف التعليمية - هدف واحد لكل سطر",
  "etapes": [
    {"phase": "المقدمة", "duree": "5 دقائق", "activite": "وصف نشاط المقدمة"},
    {"phase": "النشاط الرئيسي", "duree": "25 دقيقة", "activite": "وصف النشاط الرئيسي"},
    {"phase": "الخلاصة", "duree": "10 دقائق", "activite": "نشاط الخلاصة"},
    {"phase": "الختام", "duree": "5 دقائق", "activite": "الختام والإعلان عن الواجبات"}
  ],
  "Ressources": "الموارد المحددة",
  "Devoirs": "اقتراحات الواجبات",
  "DiffLents": "دعم المتعلمين البطيئين",
  "DiffTresPerf": "تحديات للمتفوقين",
  "DiffTous": "تمايز للصف بأكمله"
}

سياق الدرس:
- المادة: ${safeMatiere}
- الفصل: ${safeClasse}
- الموضوع: ${safeLecon}
- أعمال الصف: ${safeTravaux}
- المواد: ${safeSupport}
- الواجبات: ${safeDevoirsPrevus}

قواعد مهمة:
1. استخدم علامات الاقتباس المستقيمة (") فقط لهيكل JSON
2. للنص، استبدل جميع علامات الاقتباس بالفواصل العليا (')
3. احتفظ بكل النص في سطر واحد
4. يجب أن تكون جميع المفاتيح كما هو موضح بالضبط
5. أعد كائن JSON فقط، لا شيء آخر`;
    } else {
      prompt = `Tu es un générateur JSON. Renvoie UNIQUEMENT un objet JSON valide (pas de markdown, pas de blocs de code, pas de texte supplémentaire).

Crée un plan de leçon de 45 minutes avec cette structure EXACTE:
{
  "TitreUnite": "titre d'unité pertinent",
  "Methodes": "liste des méthodes pédagogiques",
  "Outils": "liste des outils et matériels",
  "Objectifs": "objectifs d'apprentissage - un par ligne avec tiret",
  "etapes": [
    {"phase": "Introduction", "duree": "5 min", "activite": "description activité introduction"},
    {"phase": "Activité Principale", "duree": "25 min", "activite": "description activité principale"},
    {"phase": "Synthèse", "duree": "10 min", "activite": "activité de synthèse"},
    {"phase": "Clôture", "duree": "5 min", "activite": "clôture et annonce devoirs"}
  ],
  "Ressources": "ressources spécifiques à utiliser",
  "Devoirs": "suggestions de devoirs",
  "DiffLents": "soutien pour élèves en difficulté",
  "DiffTresPerf": "défis pour élèves performants",
  "DiffTous": "différenciation pour toute la classe"
}

Contexte de la leçon:
- Matière: ${safeMatiere}
- Classe: ${safeClasse}
- Thème: ${safeLecon}
- Travaux de classe: ${safeTravaux}
- Support/Matériel: ${safeSupport}
- Devoirs prévus: ${safeDevoirsPrevus}

RÈGLES IMPORTANTES:
1. Utilise uniquement des guillemets droits (") pour la structure JSON
2. Pour le contenu texte, remplace tous les guillemets par des apostrophes (')
3. Garde tout le texte sur une seule ligne (pas de sauts de ligne dans les chaînes)
4. Toutes les clés doivent être exactement comme indiqué
5. Renvoie UNIQUEMENT l'objet JSON, rien d'autre`;
    }

    // === Appeler l'API Gemini avec rotation automatique des clés ===
    console.log('🤖 [AI Lesson Plan] Appel à Gemini avec rotation automatique des clés...');
    const geminiResult = await callGeminiWithFallback(prompt);
    
    if (!geminiResult.success) {
      console.error('❌ [AI Lesson Plan] TOUTES LES CLÉS GEMINI ÉPUISÉES');
      throw new Error(`⚠️ QUOTA API ÉPUISÉ : Toutes les ${GEMINI_API_KEYS.length} clés Gemini ont atteint leur limite. Veuillez réessayer demain. ${geminiResult.error || ''}`);
    }
    
    const providerUsed = geminiResult.provider;
    const modelUsed = geminiResult.modelUsed;
    const aiResult = geminiResult.data;
    console.log(`✅ [AI Lesson Plan] Succès avec ${providerUsed} (modèle: ${modelUsed})`);

    // Extraction du texte JSON renvoyé (format Gemini)
    let text = "";
    try {
      text = aiResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text && Array.isArray(aiResult?.candidates?.[0]?.content?.parts)) {
        text = aiResult.candidates[0].content.parts.map(p => p.text || "").join("").trim();
      }
      if (!text && aiResult?.candidates?.[0]?.output_text) {
        text = String(aiResult.candidates[0].output_text).trim();
      }
    } catch (_) {}

    if (!text) {
      console.error("Réponse IA vide ou non reconnue:", JSON.stringify(aiResult, null, 2));
      return res.status(500).json({ message: "Réponse IA vide ou non reconnue." });
    }

    // ========================================
    // 🔥 PARSING JSON ULTRA-ROBUSTE (identique au ZIP)
    // ========================================
    let aiData;
    try {
      let cleanedJson = text
        .replace(/```json\n?|```\n?|```/g, '')
        .replace(/^[^{]*/, '')
        .replace(/[^}]*$/, '')
        .trim();
      
      if (!cleanedJson || cleanedJson.length < 10) {
        throw new Error('Contenu JSON vide ou trop court');
      }
      
      try {
        aiData = JSON.parse(cleanedJson);
        console.log(`✅ [Single Plan] JSON parsé du premier coup`);
      } catch (firstParseError) {
        console.warn(`⚠️ [Single Plan] 1er parsing échoué: ${firstParseError.message}`);
        
        const originalJson = cleanedJson;
        
        // Réparation AGRESSIVE
        cleanedJson = cleanedJson.replace(/\\(?!["'nrtbf\\])/g, '/');
        cleanedJson = cleanedJson.replace(/"([^"]*?)\n([^"]*?)"/g, (match, before, after) => {
          return `"${before}\\n${after}"`;
        });
        cleanedJson = cleanedJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        
        // Remplacer guillemets orphelins
        let inString = false;
        let fixed = '';
        let lastWasEscape = false;
        
        for (let i = 0; i < cleanedJson.length; i++) {
          const char = cleanedJson[i];
          const nextChar = cleanedJson[i + 1];
          
          if (char === '\\' && !lastWasEscape) {
            lastWasEscape = true;
            fixed += char;
            continue;
          }
          
          if (char === '"' && !lastWasEscape) {
            if (inString && nextChar && !/[:,\}\]\n\s]/.test(nextChar)) {
              fixed += "''";
              lastWasEscape = false;
              continue;
            }
            inString = !inString;
          }
          
          fixed += char;
          lastWasEscape = false;
        }
        
        cleanedJson = fixed;
        
        try {
          aiData = JSON.parse(cleanedJson);
          console.log(`✅ [Single Plan] JSON réparé après corrections`);
        } catch (secondParseError) {
          console.error(`❌ [Single Plan] Parsing échoue même après réparation`);
          console.error(`  - Erreur: ${secondParseError.message}`);
          
          const errorPos = parseInt(secondParseError.message.match(/position (\d+)/)?.[1] || '0');
          if (errorPos > 0 && errorPos < originalJson.length) {
            const start = Math.max(0, errorPos - 150);
            const end = Math.min(originalJson.length, errorPos + 150);
            const context = originalJson.substring(start, end);
            const pointer = ' '.repeat(Math.min(150, errorPos - start)) + '^';
            console.error(`  - Contexte (±150 chars):\n${context}\n${pointer}`);
          }
          
          console.error(`  - JSON (premiers 2000 chars):\n${originalJson.substring(0, 2000)}`);
          throw new Error(`Parsing JSON impossible: ${secondParseError.message}`);
        }
      }
      
      if (!aiData || typeof aiData !== 'object') {
        throw new Error('JSON parsé mais structure invalide');
      }
      
      if (!aiData.TitreUnite && !aiData.Objectifs && !aiData.etapes) {
        throw new Error('Structure JSON invalide: champs essentiels manquants');
      }
    } catch (parseError) {
      console.error(`❌ [Single Plan] Erreur parsing JSON: ${parseError.message}`);
      throw new Error(`Format JSON invalide: ${parseError.message}`);
    }

    // Préparer le DOCX
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });

    let minutageString = "";
    let contenuString = "";
    if (aiData.etapes && Array.isArray(aiData.etapes)) {
      minutageString = aiData.etapes.map(e => e.duree || "").join('\n');
      contenuString = aiData.etapes.map(e => `▶ ${e.phase || ""}:\n${e.activite || ""}`).join('\n\n');
    }

    const templateData = {
      ...aiData,
      Semaine: week,
      Lecon: lecon,
      Matiere: matiere,
      Classe: classe,
      Jour: jour,
      Seance: seance,
      NomEnseignant: enseignant,
      Date: formattedDate,
      Deroulement: minutageString,
      Contenu: contenuString,
    };

    doc.render(templateData);
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Format: Matière_Classe_Semaine_Séance_Enseignant.docx
    const filename = `${sanitizeForFilename(matiere)}_${sanitizeForFilename(classe)}_S${weekNumber}_P${sanitizeForFilename(seance)}_${sanitizeForFilename(enseignant)}.docx`;
    console.log(`📄 [AI Lesson Plan] Envoi du fichier: ${filename}`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
    console.log('✅ [AI Lesson Plan] Génération terminée avec succès');

  } catch (error) {
    console.error('❌ Erreur serveur /generate-ai-lesson-plan:', error);
    if (!res.headersSent) {
      const errorMessage = error.message || "Erreur interne.";
      res.status(500).json({ message: `Erreur interne lors de la génération IA: ${errorMessage}` });
    }
  }
});

// Sauvegarder un plan de leçon généré dans MongoDB
app.post('/api/save-lesson-plan', async (req, res) => {
  try {
    console.log('💾 [Save Lesson Plan] Sauvegarde d\'un plan de leçon');
    
    const { week, rowData, fileBuffer, filename } = req.body;
    
    if (!week || !rowData || !fileBuffer || !filename) {
      return res.status(400).json({ message: 'Données manquantes pour la sauvegarde.' });
    }
    
    const db = await connectToDatabase();
    
    // Créer ou mettre à jour le document du plan de leçon
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const periode = rowData[findKey(rowData, 'Période')] || '';
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    
    const lessonPlanId = `${week}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
    
    await db.collection('lessonPlans').updateOne(
      { _id: lessonPlanId },
      {
        $set: {
          week: Number(week),
          enseignant,
          classe,
          matiere,
          periode,
          jour,
          filename,
          fileBuffer: Buffer.from(fileBuffer, 'base64'),
          createdAt: new Date(),
          rowData
        }
      },
      { upsert: true }
    );
    
    console.log(`✅ [Save Lesson Plan] Plan sauvegardé: ${lessonPlanId}`);
    res.status(200).json({ success: true, message: 'Plan de leçon sauvegardé.', lessonPlanId });
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la sauvegarde du plan de leçon.' });
  }
});

// ============================================================================
// NOUVELLE ROUTE: Génération multiple de plans de leçon IA en ZIP
// ============================================================================
app.post('/api/generate-multiple-ai-lesson-plans', async (req, res) => {
  try {
    console.log('📚 [Multiple AI Lesson Plans] Nouvelle demande de génération multiple');
    
    // Support GROQ API (prioritaire) avec fallback vers GEMINI
    // Vérifier qu'au moins une clé Gemini est disponible
    if (!GEMINI_API_KEYS || GEMINI_API_KEYS.length === 0) {
      return res.status(503).json({ message: "Le service IA n'est pas initialisé. Vérifiez les clés API Gemini." });
    }
    
    console.log(`🔧 [Multiple AI] Provider IA: Gemini avec ${GEMINI_API_KEYS.length} clés (rotation automatique)`);

    const lessonTemplateUrl = process.env.LESSON_TEMPLATE_URL || LESSON_TEMPLATE_URL;
    if (!lessonTemplateUrl) {
      return res.status(503).json({ message: "L'URL du modèle de leçon Word n'est pas configurée." });
    }

    const { week, rowsData } = req.body;
    if (!Array.isArray(rowsData) || rowsData.length === 0 || !week) {
      return res.status(400).json({ message: "Données invalides ou vides." });
    }

    console.log(`✅ [Multiple AI Lesson Plans] Génération de ${rowsData.length} plans pour semaine ${week}`);

    // ⚡ FILTRER LES LIGNES OÙ AUCUN CHAMP REQUIS N'EST REMPLI
    // Critère: Au moins UN des 4 champs (Leçon, Travaux de classe, Support, Devoirs) doit être rempli
    const validRows = [];
    const skippedRows = [];
    
    for (let i = 0; i < rowsData.length; i++) {
      const rowData = rowsData[i];
      const lecon = (rowData[findKey(rowData, 'Leçon')] || '').trim();
      const travaux = (rowData[findKey(rowData, 'Travaux de classe')] || '').trim();
      const support = (rowData[findKey(rowData, 'Support')] || '').trim();
      const devoirs = (rowData[findKey(rowData, 'Devoirs')] || '').trim();
      
      const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
      const classe = rowData[findKey(rowData, 'Classe')] || '';
      const matiere = rowData[findKey(rowData, 'Matière')] || '';
      
      // Vérifier si AU MOINS UN des 4 champs contient du texte (>2 caractères)
      const hasContent = (lecon.length >= 3) || (travaux.length >= 3) || (support.length >= 3) || (devoirs.length >= 3);
      
      if (!hasContent) {
        console.log(`⏭️  [${i+1}/${rowsData.length}] IGNORÉ (aucun contenu): ${enseignant} | ${classe} | ${matiere}`);
        skippedRows.push({ index: i+1, enseignant, classe, matiere, reason: 'Aucun des champs requis (Leçon, Travaux, Support, Devoirs) n\'est rempli' });
      } else {
        console.log(`✓ [${i+1}/${rowsData.length}] VALIDE (contenu détecté): ${enseignant} | ${classe} | ${matiere}`);
        validRows.push({ index: i, rowData });
      }
    }
    
    console.log(`📊 [Multiple AI] ${validRows.length} lignes valides, ${skippedRows.length} ignorées`);
    
    if (validRows.length === 0) {
      return res.status(400).json({ 
        message: "Aucune ligne avec une leçon valide à générer.",
        skipped: skippedRows
      });
    }

    // Charger le modèle Word une seule fois
    let templateBuffer;
    try {
      const response = await fetch(lessonTemplateUrl);
      if (!response.ok) throw new Error(`Échec téléchargement modèle (${response.status})`);
      templateBuffer = Buffer.from(await response.arrayBuffer());
    } catch (e) {
      console.error("Erreur récupération modèle:", e);
      return res.status(500).json({ message: "Impossible de récupérer le modèle de leçon." });
    }

    // Configuration du ZIP
    const archive = archiver('zip', { zlib: { level: 9 } });
    const filename = `Plans_Lecon_IA_S${week}_${validRows.length}_fichiers.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    archive.pipe(res);

    const weekNumber = Number(week);
    const datesNode = specificWeekDateRangesNode[weekNumber];

    // Le modèle Gemini sera résolu automatiquement par callGeminiWithFallback()

    let successCount = 0;
    let errorCount = 0;
    const providerStats = { GEMINI_1: 0, GEMINI_2: 0, GEMINI_3: 0, GEMINI_4: 0, errors: 0 };
    
    // Si des lignes ont été ignorées, ajouter un fichier récapitulatif
    if (skippedRows.length > 0) {
      const skipContent = `⏭️  LIGNES IGNORÉES (AUCUN CONTENU PÉDAGOGIQUE)\n\nTotal: ${skippedRows.length} ligne(s)\n\nCritère d'exclusion: Aucun des 4 champs requis (Leçon, Travaux de classe, Support, Devoirs) n'est rempli.\n\n` +
        skippedRows.map(r => `${r.index}. ${r.enseignant} | ${r.classe} | ${r.matiere}\n   Raison: ${r.reason}`).join('\n\n');
      archive.append(Buffer.from(skipContent, 'utf-8'), { name: '00_LIGNES_IGNOREES.txt' });
    }

    // Générer chaque plan de leçon (uniquement les lignes valides)
    for (let i = 0; i < validRows.length; i++) {
      const { index: originalIndex, rowData } = validRows[i];
      
      try {
        // Extraire données
        const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
        const classe = rowData[findKey(rowData, 'Classe')] || '';
        const matiere = rowData[findKey(rowData, 'Matière')] || '';
        const lecon = rowData[findKey(rowData, 'Leçon')] || '';
        const jour = rowData[findKey(rowData, 'Jour')] || '';
        const seance = rowData[findKey(rowData, 'Période')] || '';
        const support = rowData[findKey(rowData, 'Support')] || 'Non spécifié';
        const travaux = rowData[findKey(rowData, 'Travaux de classe')] || 'Non spécifié';
        const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || 'Non spécifié';

        console.log(`📝 [${i+1}/${validRows.length}] (Ligne originale #${originalIndex+1}) ${enseignant} | ${classe} | ${matiere}`);
        console.log(`  ├─ Leçon: "${lecon.substring(0, 50)}${lecon.length > 50 ? '...' : ''}"`);
        console.log(`  ├─ Travaux: "${travaux.substring(0, 30)}${travaux.length > 30 ? '...' : ''}"`);
        console.log(`  ├─ Support: "${support.substring(0, 30)}${support.length > 30 ? '...' : ''}"`);
        console.log(`  └─ Devoirs: "${devoirsPrevus.substring(0, 30)}${devoirsPrevus.length > 30 ? '...' : ''}"`);
        
        // Note: Vérification déjà faite en amont (au moins 1 des 4 champs rempli)
        // Aucune vérification supplémentaire nécessaire ici

        // Date formatée
        let formattedDate = "";
        if (jour && datesNode?.start) {
          const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
          if (!isNaN(weekStartDateNode.getTime())) {
            const dayName = extractDayNameFromString(jour);
            if (dayName) {
              const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
              if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
            }
          }
        }

        // ========================================
        // 🔥 PROMPT OPTIMISÉ POUR FORCER JSON VALIDE
        // ========================================
        // Stratégie : Mode JSON de Gemini avec contraintes strictes
        // + nettoyage des données d'entrée pour éviter pollution
        
        // Nettoyer les données d'entrée des caractères problématiques
        const cleanText = (text) => {
          if (!text) return 'Non spécifié';
          return text
            .replace(/"/g, "''")  // Remplacer " par ''
            .replace(/\\/g, '/')   // Remplacer \ par /
            .replace(/[\r\n]+/g, ' ') // Remplacer retours à la ligne par espace
            .replace(/\s+/g, ' ')    // Normaliser espaces multiples
            .trim();
        };
        
        const safeMatiere = cleanText(matiere);
        const safeClasse = cleanText(classe);
        const safeLecon = cleanText(lecon);
        const safeTravaux = cleanText(travaux);
        const safeSupport = cleanText(support);
        const safeDevoirsPrevus = cleanText(devoirsPrevus);

        let prompt;
        if (englishTeachers.includes(enseignant)) {
          prompt = `You are a JSON generator. Return ONLY a valid JSON object (no markdown, no code blocks, no extra text).

Create a 45-minute lesson plan with this EXACT structure:
{
  "TitreUnite": "relevant unit title",
  "Methodes": "teaching methods list",
  "Outils": "tools and materials list",
  "Objectifs": "learning objectives - one per line with dash prefix",
  "etapes": [
    {"phase": "Introduction", "duree": "5 min", "activite": "intro activity description"},
    {"phase": "Main Activity", "duree": "25 min", "activite": "main activity description"},
    {"phase": "Summary", "duree": "10 min", "activite": "summary activity"},
    {"phase": "Closing", "duree": "5 min", "activite": "closing and homework announcement"}
  ],
  "Ressources": "specific resources to use",
  "Devoirs": "homework suggestions",
  "DiffLents": "support for struggling learners",
  "DiffTresPerf": "challenges for high achievers",
  "DiffTous": "whole-class differentiation"
}

Lesson context:
- Subject: ${safeMatiere}
- Class: ${safeClasse}
- Topic: ${safeLecon}
- Planned classwork: ${safeTravaux}
- Materials: ${safeSupport}
- Homework: ${safeDevoirsPrevus}

IMPORTANT RULES:
1. Use only straight quotes (") for JSON structure
2. For text content, replace all quotes with apostrophes (')
3. Keep all text on single lines (no line breaks inside strings)
4. All keys must be exactly as shown
5. Return ONLY the JSON object, nothing else`;
        } else if (arabicTeachers.includes(enseignant)) {
          prompt = `أنت مولد JSON. أعد فقط كائن JSON صالح (بدون markdown، بدون كتل كود، بدون نص إضافي).

أنشئ خطة درس 45 دقيقة بهذا الهيكل الدقيق:
{
  "TitreUnite": "عنوان الوحدة",
  "Methodes": "قائمة طرق التدريس",
  "Outils": "قائمة الأدوات والمواد",
  "Objectifs": "الأهداف التعليمية - هدف واحد لكل سطر",
  "etapes": [
    {"phase": "المقدمة", "duree": "5 دقائق", "activite": "وصف نشاط المقدمة"},
    {"phase": "النشاط الرئيسي", "duree": "25 دقيقة", "activite": "وصف النشاط الرئيسي"},
    {"phase": "الخلاصة", "duree": "10 دقائق", "activite": "نشاط الخلاصة"},
    {"phase": "الختام", "duree": "5 دقائق", "activite": "الختام والإعلان عن الواجبات"}
  ],
  "Ressources": "الموارد المحددة",
  "Devoirs": "اقتراحات الواجبات",
  "DiffLents": "دعم المتعلمين البطيئين",
  "DiffTresPerf": "تحديات للمتفوقين",
  "DiffTous": "تمايز للصف بأكمله"
}

سياق الدرس:
- المادة: ${safeMatiere}
- الفصل: ${safeClasse}
- الموضوع: ${safeLecon}
- أعمال الصف: ${safeTravaux}
- المواد: ${safeSupport}
- الواجبات: ${safeDevoirsPrevus}

قواعد مهمة:
1. استخدم علامات الاقتباس المستقيمة (") فقط لهيكل JSON
2. للنص، استبدل جميع علامات الاقتباس بالفواصل العليا (')
3. احتفظ بكل النص في سطر واحد
4. يجب أن تكون جميع المفاتيح كما هو موضح بالضبط
5. أعد كائن JSON فقط، لا شيء آخر`;
        } else {
          prompt = `Tu es un générateur JSON. Renvoie UNIQUEMENT un objet JSON valide (pas de markdown, pas de blocs de code, pas de texte supplémentaire).

Crée un plan de leçon de 45 minutes avec cette structure EXACTE:
{
  "TitreUnite": "titre d'unité pertinent",
  "Methodes": "liste des méthodes pédagogiques",
  "Outils": "liste des outils et matériels",
  "Objectifs": "objectifs d'apprentissage - un par ligne avec tiret",
  "etapes": [
    {"phase": "Introduction", "duree": "5 min", "activite": "description activité introduction"},
    {"phase": "Activité Principale", "duree": "25 min", "activite": "description activité principale"},
    {"phase": "Synthèse", "duree": "10 min", "activite": "activité de synthèse"},
    {"phase": "Clôture", "duree": "5 min", "activite": "clôture et annonce devoirs"}
  ],
  "Ressources": "ressources spécifiques à utiliser",
  "Devoirs": "suggestions de devoirs",
  "DiffLents": "soutien pour élèves en difficulté",
  "DiffTresPerf": "défis pour élèves performants",
  "DiffTous": "différenciation pour toute la classe"
}

Contexte de la leçon:
- Matière: ${safeMatiere}
- Classe: ${safeClasse}
- Thème: ${safeLecon}
- Travaux de classe: ${safeTravaux}
- Support/Matériel: ${safeSupport}
- Devoirs prévus: ${safeDevoirsPrevus}

RÈGLES IMPORTANTES:
1. Utilise uniquement des guillemets droits (") pour la structure JSON
2. Pour le contenu texte, remplace tous les guillemets par des apostrophes (')
3. Garde tout le texte sur une seule ligne (pas de sauts de ligne dans les chaînes)
4. Toutes les clés doivent être exactement comme indiqué
5. Renvoie UNIQUEMENT l'objet JSON, rien d'autre`;
        }

        // Appel API avec FALLBACK automatique sur les 4 clés Gemini
        let rawContent, usedProvider;
        try {
          const result = await callGeminiWithFallback(prompt);
          
          // Vérifier que l'appel a réussi
          if (!result.success) {
            throw new Error(result.error || 'Toutes les clés API Gemini ont échoué');
          }
          
          // Extraire le contenu de la réponse Gemini
          rawContent = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!rawContent) {
            console.error('❌ Structure de réponse invalide:', JSON.stringify(result.data, null, 2));
            throw new Error('Réponse Gemini vide ou format invalide');
          }
          
          usedProvider = result.provider.replace('Gemini API', 'GEMINI_');
          providerStats[usedProvider]++;
          console.log(`✅ [${i+1}/${validRows.length}] Généré avec ${result.provider}`);
        } catch (apiError) {
          console.error(`❌ [${i+1}/${validRows.length}] Échec après toutes les tentatives:`, apiError.message);
          providerStats.errors++;
          errorCount++;
          
          // Ajouter un fichier d'erreur dans le ZIP
          const errorFileName = `ERREUR_${sanitizeForFilename(enseignant)}_${sanitizeForFilename(classe)}_${sanitizeForFilename(matiere)}.txt`;
          const errorContent = `❌ ERREUR DE GÉNÉRATION\n\nEnseignant: ${enseignant}\nClasse: ${classe}\nMatière: ${matiere}\nLeçon: ${lecon}\n\nErreur: ${apiError.message}\n\nToutes les clés API Gemini ont été épuisées ou ont échoué.`;
          archive.append(Buffer.from(errorContent, 'utf-8'), { name: errorFileName });
          continue; // Passer au suivant
        }
        
        // ========================================
        // 🔥 PARSING JSON ULTRA-ROBUSTE
        // ========================================
        let jsonData;
        try {
          // Étape 1: Nettoyage initial agressif
          let cleanedJson = rawContent
            .replace(/```json\n?|```\n?|```/g, '')  // Supprimer markdown
            .replace(/^[^{]*/, '')  // Supprimer tout avant le premier {
            .replace(/[^}]*$/, '')  // Supprimer tout après le dernier }
            .trim();
          
          if (!cleanedJson || cleanedJson.length < 10) {
            throw new Error('Contenu JSON vide ou trop court après nettoyage');
          }
          
          // Étape 2: Tentative parsing direct
          try {
            jsonData = JSON.parse(cleanedJson);
            console.log(`✅ JSON parsé du premier coup`);
          } catch (firstParseError) {
            console.warn(`⚠️ 1er parsing échoué: ${firstParseError.message}`);
            
            // Étape 3: Réparation AGRESSIVE avec regex
            const originalJson = cleanedJson;
            
            // a) Remplacer TOUS les backslashes seuls par forward slash
            cleanedJson = cleanedJson.replace(/\\(?!["'nrtbf\\])/g, '/');
            
            // b) Échapper correctement les sauts de ligne littéraux dans les strings
            // Pattern: "text<NEWLINE>text" → "text\ntext"
            cleanedJson = cleanedJson.replace(/"([^"]*?)\n([^"]*?)"/g, (match, before, after) => {
              return `"${before}\\n${after}"`;
            });
            
            // c) Supprimer les caractères de contrôle invisibles
            cleanedJson = cleanedJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            
            // d) Normaliser les guillemets à l'intérieur des strings
            // Stratégie: détecter les guillemets orphelins et les remplacer par ''
            // Pattern complexe: chercher ":"..."..."..." et remplacer guillemets internes
            let inString = false;
            let fixed = '';
            let lastWasEscape = false;
            
            for (let i = 0; i < cleanedJson.length; i++) {
              const char = cleanedJson[i];
              const nextChar = cleanedJson[i + 1];
              
              if (char === '\\' && !lastWasEscape) {
                lastWasEscape = true;
                fixed += char;
                continue;
              }
              
              if (char === '"' && !lastWasEscape) {
                // Si on est dans une string et le prochain caractère n'est pas :,}]\n
                // C'est probablement un guillemet interne → remplacer par ''
                if (inString && nextChar && !/[:,\}\]\n\s]/.test(nextChar)) {
                  fixed += "''";
                  lastWasEscape = false;
                  continue;
                }
                inString = !inString;
              }
              
              fixed += char;
              lastWasEscape = false;
            }
            
            cleanedJson = fixed;
            
            // Étape 4: Deuxième tentative
            try {
              jsonData = JSON.parse(cleanedJson);
              console.log(`✅ JSON réparé après corrections agressives`);
            } catch (secondParseError) {
              console.error(`❌ Parsing échoue même après réparation`);
              console.error(`  - Erreur: ${secondParseError.message}`);
              
              // Extraire position et contexte de l'erreur
              const errorPos = parseInt(secondParseError.message.match(/position (\d+)/)?.[1] || '0');
              if (errorPos > 0 && errorPos < originalJson.length) {
                const start = Math.max(0, errorPos - 150);
                const end = Math.min(originalJson.length, errorPos + 150);
                const context = originalJson.substring(start, end);
                const pointer = ' '.repeat(Math.min(150, errorPos - start)) + '^';
                console.error(`  - Contexte (±150 chars):\n${context}\n${pointer}`);
              }
              
              // Log JSON complet pour debug (limité à 2000 chars)
              console.error(`  - JSON original (premiers 2000 chars):\n${originalJson.substring(0, 2000)}`);
              
              throw new Error(`Parsing JSON impossible: ${secondParseError.message}`);
            }
          }
          
          // Vérifier structure minimale
          if (!jsonData || typeof jsonData !== 'object') {
            throw new Error('JSON parsé mais structure invalide (pas un objet)');
          }
          
          if (!jsonData.TitreUnite && !jsonData.Objectifs && !jsonData.etapes) {
            throw new Error('Structure JSON invalide: champs essentiels manquants (TitreUnite, Objectifs, etapes)');
          }
        } catch (parseError) {
          console.error(`❌ Erreur parsing JSON pour ${classe} ${matiere}:`);
          console.error(`  - Message: ${parseError.message}`);
          
          throw new Error(`Format JSON invalide: ${parseError.message}`);
        }

        // Générer le document Word
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, nullGetter: () => "" });

        // Formatter les données pour le template
        const minutageString = (jsonData.etapes || []).map(e =>
          `${e.phase || ""} (${e.duree || ""}):\n${e.activite || ""}`
        ).join('\n\n');

        const templateData = {
          TitreUnite: jsonData.TitreUnite || "",
          Methodes: jsonData.Methodes || "",
          Outils: jsonData.Outils || "",
          Objectifs: jsonData.Objectifs || "",
          Ressources: jsonData.Ressources || "",
          Devoirs: jsonData.Devoirs || "",
          DiffLents: jsonData.DiffLents || "",
          DiffTresPerf: jsonData.DiffTresPerf || "",
          DiffTous: jsonData.DiffTous || "",
          Classe: classe,
          Matiere: matiere,
          Lecon: lecon,
          Seance: seance,
          NomEnseignant: enseignant,
          Date: formattedDate,
          Deroulement: minutageString,
          Contenu: minutageString, // Le contenu est le déroulement des étapes
          Minutage: minutageString, // Alias pour compatibilité
        };

        doc.render(templateData);
        const docBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

        // Format: Matière_Classe_Semaine_Séance_Enseignant.docx
        const docFilename = `${sanitizeForFilename(matiere)}_${sanitizeForFilename(classe)}_S${weekNumber}_P${sanitizeForFilename(seance)}_${sanitizeForFilename(enseignant)}.docx`;
        
        // Ajouter au ZIP
        archive.append(docBuffer, { name: docFilename });
        successCount++;
        
        console.log(`✅ [${i+1}/${validRows.length}] Généré: ${docFilename}`);

        // Délai adaptatif pour éviter rate limit
        if (i < validRows.length - 1) {
          // Délai progressif : 3s pour les premières, 5s après 10, 8s après 20
          let delay = 3000; // 3 secondes par défaut
          if (i >= 20) delay = 8000; // 8 secondes après 20 générations
          else if (i >= 10) delay = 5000; // 5 secondes après 10 générations
          
          console.log(`⏳ Pause de ${delay/1000}s avant la prochaine génération...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        const classe = rowData[findKey(rowData, 'Classe')] || 'Unknown';
        const matiere = rowData[findKey(rowData, 'Matière')] || 'Unknown';
        const enseignant = rowData[findKey(rowData, 'Enseignant')] || 'Unknown';
        const lecon = rowData[findKey(rowData, 'Leçon')] || 'VIDE';
        
        console.error(`❌ Erreur pour ligne ${i+1}:`, {
          error: error.message,
          stack: error.stack,
          classe,
          matiere,
          enseignant,
          lecon: lecon.substring(0, 50) // Premiers 50 caractères
        });
        errorCount++;
        
        // Ajouter un fichier texte d'erreur DÉTAILLÉ dans le ZIP
        const errorFilename = `ERREUR_${String(i+1).padStart(2, '0')}_${sanitizeForFilename(classe)}_${sanitizeForFilename(matiere)}.txt`;
        const errorContent = `❌ ERREUR DE GÉNÉRATION - PLAN DE LEÇON IA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 INFORMATIONS DE LA LIGNE
  Ligne valide    : ${i+1}/${validRows.length}
  Ligne originale : ${originalIndex+1}/${rowsData.length}
  
👤 ENSEIGNANT     : ${enseignant}
📚 CLASSE         : ${classe}
📖 MATIÈRE        : ${matiere}

📝 LEÇON (premiers 300 caractères) :
${lecon.substring(0, 300)}${lecon.length > 300 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ERREUR DÉTECTÉE :
${error.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 STACK TRACE COMPLET :
${error.stack}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DONNÉES COMPLÈTES DE LA LIGNE :
${JSON.stringify(rowData, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 SOLUTIONS POSSIBLES :
1. Vérifier que la clé API (GROQ ou GEMINI) est valide
2. Vérifier que le quota API n'est pas dépassé
3. Vérifier que la leçon contient suffisamment d'information
4. Réessayer la génération plus tard si c'est un problème de quota
5. Contacter le support si l'erreur persiste

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${new Date().toISOString()}
Provider IA: ${USE_GROQ ? 'GROQ (llama-3.3-70b-versatile)' : 'GEMINI'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        archive.append(Buffer.from(errorContent, 'utf-8'), { name: errorFilename });
      }
    }

    console.log(`📊 [Multiple AI] Résultat: ${successCount} succès, ${errorCount} erreurs`);
    
    // Ajouter un fichier récapitulatif final
    const summaryContent = `📊 RÉCAPITULATIF DE GÉNÉRATION - PLANS DE LEÇON IA
    
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Date de génération : ${new Date().toLocaleString('fr-FR')}
📦 Semaine            : ${week}
🔧 Provider IA        : Gemini (Fallback automatique sur 4 clés)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 STATISTIQUES :
  Lignes totales reçues  : ${rowsData.length}
  Lignes valides         : ${validRows.length}
  Lignes ignorées        : ${skippedRows.length} (leçons vides)
  
  ✅ Succès              : ${successCount}
  ❌ Erreurs             : ${errorCount}
  
  📊 Taux de réussite    : ${validRows.length > 0 ? Math.round((successCount / validRows.length) * 100) : 0}%

🔑 UTILISATION DES CLÉS API GEMINI :
  GEMINI_1 : ${providerStats.GEMINI_1} génération(s)
  GEMINI_2 : ${providerStats.GEMINI_2} génération(s)
  GEMINI_3 : ${providerStats.GEMINI_3} génération(s)
  GEMINI_4 : ${providerStats.GEMINI_4} génération(s)
  Erreurs  : ${providerStats.errors} échec(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${errorCount > 0 ? `⚠️  ATTENTION : ${errorCount} erreur(s) détectée(s)
Consultez les fichiers ERREUR_XX_*.txt pour plus de détails.

💡 CAUSES POSSIBLES DES ERREURS :
- Toutes les clés API Gemini ont atteint leur quota journalier (429)
- Problème de connexion réseau
- Format de réponse invalide de l'IA
- Données de leçon insuffisantes

🔑 SOLUTION : Réessayer plus tard
Les quotas Gemini se réinitialisent toutes les 24 heures.
Le système bascule automatiquement entre les 4 clés API disponibles.
` : '🎉 Toutes les générations ont réussi !'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 CONTENU DU ZIP :
${skippedRows.length > 0 ? `  - 00_LIGNES_IGNOREES.txt (${skippedRows.length} lignes)\n` : ''}  - ${successCount} fichier(s) .docx (plans générés)
${errorCount > 0 ? `  - ${errorCount} fichier(s) ERREUR_*.txt (détails des erreurs)\n` : ''}  - 99_RECAPITULATIF.txt (ce fichier)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Généré par le système de gestion des plans hebdomadaires
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    archive.append(Buffer.from(summaryContent, 'utf-8'), { name: '99_RECAPITULATIF.txt' });
    
    archive.finalize();

  } catch (error) {
    console.error('❌ Erreur serveur /generate-multiple-ai-lesson-plans:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: `Erreur interne: ${error.message}` });
    }
  }
});

// Télécharger un plan de leçon depuis MongoDB
app.get('/api/download-lesson-plan/:lessonPlanId', async (req, res) => {
  try {
    const { lessonPlanId } = req.params;
    console.log(`📥 [Download Lesson Plan] Téléchargement: ${lessonPlanId}`);
    
    const db = await connectToDatabase();
    const lessonPlan = await db.collection('lessonPlans').findOne({ _id: lessonPlanId });
    
    if (!lessonPlan) {
      return res.status(404).json({ message: 'Plan de leçon introuvable.' });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${lessonPlan.filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(lessonPlan.fileBuffer.buffer);
    
    console.log(`✅ [Download Lesson Plan] Envoyé: ${lessonPlan.filename}`);
    
  } catch (error) {
    console.error('❌ Erreur téléchargement plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement du plan de leçon.' });
  }
});

// Obtenir la liste des plans de leçon pour une semaine spécifique
app.get('/api/lesson-plans/:week', async (req, res) => {
  try {
    const week = parseInt(req.params.week, 10);
    if (isNaN(week)) {
      return res.status(400).json({ message: 'Numéro de semaine invalide.' });
    }
    
    console.log(`📋 [Lesson Plans List] Récupération pour semaine ${week}`);
    
    const db = await connectToDatabase();
    const lessonPlans = await db.collection('lessonPlans')
      .find({ week }, { projection: { fileBuffer: 0 } }) // Exclure le buffer pour économiser la bande passante
      .toArray();
    
    console.log(`✅ [Lesson Plans List] ${lessonPlans.length} plan(s) trouvé(s)`);
    res.status(200).json(lessonPlans);
    
  } catch (error) {
    console.error('❌ Erreur récupération liste plans de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des plans de leçon.' });
  }
});

// --------------------- Test de Rappels Forcé (Semaine 17) ---------------------

app.post('/api/test-weekly-reminders', async (req, res) => {
  try {
    const { apiKey, weekNumber } = req.body;
    const targetWeek = weekNumber || 17; // Par défaut à la semaine 17
    
    // Sécurité basique avec clé API
    const CRON_API_KEY = process.env.CRON_API_KEY || 'default-cron-key-change-me';
    if (apiKey !== CRON_API_KEY) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    console.log(`🧪 [Test Reminders] Test forcé pour la semaine ${targetWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: targetWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${targetWeek}.`,
        week: targetWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Test Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: targetWeek
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, targetWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${targetWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: targetWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: new Date().toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ [Test Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Test Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Test Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Test de rappel forcé terminé pour la semaine ${targetWeek}.`,
      week: targetWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Test Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// --------------------- Système de Notifications Push ---------------------

// Stocker les abonnements push (en production, utiliser une vraie DB)
const pushSubscriptions = new Map();

// Sauvegarder un abonnement push
app.post('/api/subscribe-push', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription) {
      return res.status(400).json({ message: 'Username et subscription requis.' });
    }

    // Sauvegarder dans MongoDB
    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').updateOne(
      { username: username },
      { $set: { subscription: subscription, updatedAt: new Date() } },
      { upsert: true }
    );

    // Cache local
    pushSubscriptions.set(username, subscription);
    
    console.log(`✅ Abonnement push sauvegardé pour ${username}`);
    res.status(200).json({ message: 'Abonnement enregistré avec succès.' });
  } catch (error) {
    console.error('Erreur /subscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Désabonner des notifications
app.post('/api/unsubscribe-push', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').deleteOne({ username: username });
    pushSubscriptions.delete(username);
    
    console.log(`✅ Désabonnement push pour ${username}`);
    res.status(200).json({ message: 'Désabonnement réussi.' });
  } catch (error) {
    console.error('Erreur /unsubscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Messages multilingues pour les notifications
const notificationMessages = {
  fr: {
    title: '⚠️ Plan Hebdomadaire Incomplet',
    body: (teacher, week, classes) => `Bonjour ${teacher}, votre plan pour la semaine ${week} est incomplet pour: ${classes}. Veuillez le compléter.`,
    reminderTitle: '📋 Rappel: Finaliser le Plan Hebdomadaire',
    reminderBody: (teacher, week) => `Bonjour ${teacher}, n'oubliez pas de finaliser votre plan pour la semaine ${week}.`
  },
  ar: {
    title: '⚠️ الخطة الأسبوعية غير مكتملة',
    body: (teacher, week, classes) => `مرحباً ${teacher}، خطتك للأسبوع ${week} غير مكتملة للفصول: ${classes}. يرجى إكمالها.`,
    reminderTitle: '📋 تذكير: أكمل الخطة الأسبوعية',
    reminderBody: (teacher, week) => `مرحباً ${teacher}، لا تنسى إكمال خطتك للأسبوع ${week}.`
  },
  en: {
    title: '⚠️ Incomplete Weekly Plan',
    body: (teacher, week, classes) => `Hello ${teacher}, your plan for week ${week} is incomplete for: ${classes}. Please complete it.`,
    reminderTitle: '📋 Reminder: Finalize Weekly Plan',
    reminderBody: (teacher, week) => `Hello ${teacher}, don't forget to finalize your plan for week ${week}.`
  }
};

// Déterminer la langue d'un enseignant
function getTeacherLanguage(teacher) {
  if (arabicTeachers.includes(teacher)) return 'ar';
  if (englishTeachers.includes(teacher)) return 'en';
  return 'fr';
}

// Vérifier les enseignants incomplets et envoyer des notifications
// Cette route sera appelée par un CRON job chaque LUNDI (3 fois par jour)
app.post('/api/check-incomplete-and-notify', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    // Sécurité basique avec clé API
    if (apiKey !== process.env.CRON_API_KEY) {
      return res.status(401).json({ message: 'Non autorisé.' });
    }

    // Déterminer la semaine actuelle
    const currentDate = new Date();
    let currentWeek = null;
    
    // Trouver la semaine actuelle
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (currentDate >= startDate && currentDate <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 Vérification des plans incomplets pour la semaine ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ message: `Aucune donnée pour la semaine ${currentWeek}.` });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 ${teachersToNotify.length} enseignants avec plans incomplets:`, teachersToNotify);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet avec leur langue
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, currentWeek, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          // Envoyer la notification push via web-push
          const payload = JSON.stringify(message);
          
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            message: message
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang}) pour ${classes}`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Vérification terminée pour la semaine ${currentWeek}.`,
      week: currentWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /check-incomplete-and-notify:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint pour tester les notifications manuellement
app.post('/api/test-notification', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    const subscription = await db.collection('pushSubscriptions').findOne({ username: username });
    
    if (!subscription) {
      return res.status(404).json({ message: `Aucun abonnement trouvé pour ${username}.` });
    }

    console.log(`🧪 Test de notification pour ${username}`);
    
    // Envoyer une notification de test
    const testMessage = {
      title: '🧪 Test de Notification',
      body: `Bonjour ${username}, ceci est un test de notification push. Si vous voyez ce message, les notifications fonctionnent correctement !`,
      icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
      data: {
        url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
        teacher: username
      }
    };

    try {
      const payload = JSON.stringify(testMessage);
      await webpush.sendNotification(subscription.subscription, payload);
      
      res.status(200).json({ 
        message: 'Notification de test envoyée avec succès.',
        username: username,
        hasSubscription: true
      });
    } catch (pushError) {
      console.error('❌ Erreur envoi notification test:', pushError);
      
      // Si l'abonnement est invalide (410 Gone), le supprimer
      if (pushError.statusCode === 410) {
        console.log(`🗑️ Suppression de l'abonnement invalide pour ${username}`);
        await db.collection('pushSubscriptions').deleteOne({ username: username });
      }
      
      throw new Error(`Échec d'envoi: ${pushError.message}`);
    }

  } catch (error) {
    console.error('❌ Erreur /test-notification:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// Endpoint pour obtenir la clé publique VAPID (nécessaire pour le frontend)
app.get('/api/vapid-public-key', (req, res) => {
  res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
});

// ✅ FONCTIONNALITÉ 3: Système d'alertes automatiques hebdomadaires
// Route pour vérifier et envoyer des alertes TOUTES LES 3 HEURES depuis le LUNDI
// Cette route doit être appelée par un CRON job externe (GitHub Actions, cron-job.org, etc.)
app.post('/api/send-weekly-reminders', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    // Sécurité basique avec clé API
    const CRON_API_KEY = process.env.CRON_API_KEY || 'default-cron-key-change-me';
    if (apiKey !== CRON_API_KEY) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const hourOfDay = now.getHours();

    console.log(`📅 [Weekly Reminders] Vérification: ${now.toISOString()} - Jour: ${dayOfWeek}, Heure: ${hourOfDay}`);

    // ⚠️ IMPORTANT: N'envoyer des alertes QUE du LUNDI (1) au JEUDI (4)
    // Le CRON doit tourner toutes les 3 heures pendant ces jours
    if (dayOfWeek < 1 || dayOfWeek > 4) {
      return res.status(200).json({ 
        message: 'Alerte désactivée (hors période Lundi-Jeudi).',
        day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dayOfWeek],
        timestamp: now.toISOString()
      });
    }

    // Déterminer la semaine actuelle
    let currentWeek = null;
    
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (now >= startDate && now <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 [Weekly Reminders] Semaine active: ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${currentWeek}.`,
        week: currentWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Weekly Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: currentWeek,
        timestamp: now.toISOString()
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, currentWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: now.toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            timestamp: now.toISOString()
          });
          
          notificationsSent++;
          console.log(`✅ [Weekly Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Weekly Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Weekly Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Rappels hebdomadaires envoyés pour la semaine ${currentWeek}.`,
      week: currentWeek,
      day: 'Lundi',
      hour: hourOfDay,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      timestamp: now.toISOString(),
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Weekly Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});
// ============================================================================
// NOUVELLE ROUTE: Notification en temps réel pour enseignants incomplets
// ============================================================================
app.post('/api/notify-incomplete-teachers', async (req, res) => {
  try {
    const { week, incompleteTeachers } = req.body;
    
    if (!week || !incompleteTeachers || typeof incompleteTeachers !== 'object') {
      return res.status(400).json({ message: 'Paramètres invalides.' });
    }

    const db = await connectToDatabase();
    const teachersToNotify = Object.keys(incompleteTeachers);
    
    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Aucun enseignant incomplet.',
        notificationsSent: 0 
      });
    }

    console.log(`🔔 Notification en temps réel pour ${teachersToNotify.length} enseignants incomplets`);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = Array.isArray(incompleteTeachers[teacher]) 
          ? incompleteTeachers[teacher].join(', ')
          : incompleteTeachers[teacher];
        
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, week, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-alert-${week}-${Date.now()}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: week,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide, le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`⚠️ Pas d'abonnement push pour ${teacher}`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Notifications envoyées: ${notificationsSent}/${teachersToNotify.length}`,
      notificationsSent: notificationsSent,
      totalIncomplete: teachersToNotify.length,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /notify-incomplete-teachers:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});
// Route pour éviter le "Cannot GET /" et valider le Health Check de Railway
app.get('/', (req, res) => {
  res.status(200).send('Serveur API Plan Hebdomadaire opérationnel');
});
// Configuration Port et Host pour Railway
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`✅ Server is running and listening on ${HOST}:${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 IA Provider: ${USE_GROQ ? 'GROQ (llama-3.3-70b)' : 'GEMINI'}`);
  console.log(`📊 MongoDB: ${MONGO_URL ? '✅ Configured' : '❌ Missing'}`);
  console.log(`📄 Templates: ${LESSON_TEMPLATE_URL && WORD_TEMPLATE_URL ? '✅ Configured' : '❌ Missing'}`);
});

// Enregistrer l'instance globale pour éviter les rechargements multiples
global.appInstance = app;
