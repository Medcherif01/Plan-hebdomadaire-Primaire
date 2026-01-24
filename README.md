# Plan Hebdomadaire - Application de Gestion

Application web pour la gestion des plans hebdomadaires scolaires avec support multilingue (Français, Arabe, Anglais).

## 🚀 Fonctionnalités

- **Gestion des plans hebdomadaires** : Création, modification et consultation des plans par semaine
- **Support multilingue** : Français, Arabe (RTL), Anglais
- **Génération de documents** :
  - Export Word par classe
  - Export Excel global
  - Plans de leçons générés par IA (Gemini)
- **Gestion par rôle** :
  - Enseignants : Consultation et modification de leurs plans
  - Administrateurs : Gestion complète et imports Excel
- **Interface responsive** : Optimisée pour tous les appareils

## 📋 Prérequis

- Node.js (v14 ou supérieur)
- MongoDB Atlas (compte gratuit)
- Clé API Google Gemini (optionnel, pour la génération IA)

## 🔧 Installation

### 1. Cloner le dépôt
```bash
git clone https://github.com/Medcherif01/Plan-hebdomadaire-Primaire.git
cd Plan-hebdomadaire-Primaire
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration des variables d'environnement

Créez un fichier `.env` à la racine du projet en vous basant sur `.env.example` :

```bash
cp .env.example .env
```

Modifiez le fichier `.env` avec vos valeurs :

```env
# MongoDB Configuration
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Word Template URLs
WORD_TEMPLATE_URL=https://votre-url-template.com/template.docx
LESSON_TEMPLATE_URL=https://votre-url-template.com/lesson-template.docx

# Gemini AI API Key
GEMINI_API_KEY=votre_cle_api_gemini

# Port
PORT=3000
```

### 4. Configuration MongoDB Atlas

1. Créez un compte sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créez un nouveau cluster
3. Dans "Database Access", créez un utilisateur avec les droits de lecture/écriture
4. Dans "Network Access", ajoutez votre adresse IP ou `0.0.0.0/0` (pour tous)
5. Dans "Database", cliquez sur "Connect" puis "Connect your application"
6. Copiez la chaîne de connexion et remplacez `<password>` par votre mot de passe

### 5. Obtenir une clé API Gemini (optionnel)

1. Allez sur [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Créez une nouvelle clé API
3. Ajoutez-la dans votre fichier `.env`

## 🎯 Utilisation

### Démarrage en développement
```bash
npm run dev
```

### Démarrage en production
```bash
npm start
```

L'application sera accessible à l'adresse : http://localhost:3000

## 🔐 Connexion

Les identifiants par défaut sont définis dans le fichier `api/index.js` :

```javascript
const validUsers = {
  "Mohamed": "Mohamed",  // Administrateur
  "Rasha": "Rasha",      // Administrateur
  "Amal": "Amal",        // Enseignant anglais
  // ... autres utilisateurs
};
```

**Format de connexion :**
- Nom d'utilisateur : Prénom de l'enseignant
- Mot de passe : Identique au nom d'utilisateur

## 📂 Structure du projet

```
Plan-hebdomadaire-Primaire/
├── api/
│   └── index.js          # Serveur Express & routes API
├── public/
│   ├── index.html        # Interface utilisateur
│   ├── script.js         # Logique frontend
│   └── style.css         # Styles CSS
├── package.json          # Dépendances Node.js
├── vercel.json           # Configuration Vercel
├── .env.example          # Exemple de variables d'environnement
└── README.md            # Ce fichier
```

## 🚀 Déploiement

### Vercel (recommandé)

1. Installez Vercel CLI :
```bash
npm install -g vercel
```

2. Déployez :
```bash
vercel
```

3. Configurez les variables d'environnement dans le dashboard Vercel :
   - Allez dans votre projet > Settings > Environment Variables
   - Ajoutez toutes les variables de votre `.env`

### Autres plateformes

L'application peut être déployée sur :
- Heroku
- Railway
- Render
- DigitalOcean App Platform

Assurez-vous toujours de configurer les variables d'environnement sur la plateforme choisie.

## 🐛 Dépannage

### Erreur "MONGO_URL not defined"
- Vérifiez que le fichier `.env` existe et contient `MONGO_URL`
- Vérifiez que le format de la chaîne de connexion MongoDB est correct
- Assurez-vous que votre IP est autorisée dans MongoDB Atlas

### Erreur "querySrv ENOTFOUND"
- Vérifiez que le nom du cluster dans `MONGO_URL` est correct
- Vérifiez votre connexion internet
- Testez la connexion avec MongoDB Compass

### Les templates Word ne se génèrent pas
- Vérifiez que `WORD_TEMPLATE_URL` et `LESSON_TEMPLATE_URL` sont définis
- Assurez-vous que les URLs sont accessibles publiquement
- Vérifiez que les fichiers sont au format `.docx`

### L'IA ne génère pas les plans de leçons
- Vérifiez que `GEMINI_API_KEY` est définie
- Vérifiez que la clé API est valide sur [Google AI Studio](https://makersuite.google.com/)
- Consultez les logs serveur pour plus de détails

## 📝 Fonctionnalités administrateur

Les utilisateurs "Mohamed" et "Rasha" ont accès aux fonctionnalités d'administration :

- Import de fichiers Excel
- Génération de rapports complets par classe
- Accès à toutes les données de tous les enseignants

## 🌐 Support multilingue

L'application détecte automatiquement la langue selon l'utilisateur :
- **Enseignants arabes** : Interface en arabe (RTL)
- **Enseignants anglais** : Interface en anglais
- **Autres utilisateurs** : Interface en français

## 📄 Licence

Ce projet est sous licence privée pour Al-Kawthar International Schools.

## 🤝 Support

Pour toute question ou problème :
1. Vérifiez la section "Dépannage" ci-dessus
2. Consultez les logs serveur avec `npm run dev`
3. Contactez l'équipe de développement

## 🔄 Mises à jour

Pour mettre à jour l'application :

```bash
git pull origin main
npm install
# Si les dépendances ont changé
npm run build  # Si nécessaire
pm2 restart all  # Si vous utilisez PM2
```
