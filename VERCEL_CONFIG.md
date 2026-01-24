# Configuration des Variables d'Environnement sur Vercel

Ce guide vous explique comment configurer correctement les variables d'environnement sur Vercel pour que votre application fonctionne sans erreurs.

## 🔑 Variables Requises

Vous devez configurer les variables suivantes dans Vercel :

### 1. MONGO_URL (OBLIGATOIRE)
**Description** : Chaîne de connexion à votre base de données MongoDB Atlas

**Format** :
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

**Comment l'obtenir** :
1. Connectez-vous à [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sélectionnez votre cluster
3. Cliquez sur "Connect" → "Connect your application"
4. Copiez la chaîne de connexion
5. Remplacez `<password>` par votre mot de passe MongoDB

**⚠️ Important** : Sans cette variable, toutes les routes API retourneront des erreurs 500.

### 2. WORD_TEMPLATE_URL (OPTIONNEL)
**Description** : URL publique du template Word pour les plans hebdomadaires

**Format** :
```
https://votre-domaine.com/templates/plan-hebdomadaire.docx
```

**Comment l'obtenir** :
- Hébergez votre fichier `.docx` sur un service comme :
  - GitHub (raw URL)
  - Google Drive (lien public)
  - Dropbox (lien direct)
  - Cloudinary
  - AWS S3

### 3. LESSON_TEMPLATE_URL (OPTIONNEL)
**Description** : URL publique du template Word pour les plans de leçons

**Format** :
```
https://votre-domaine.com/templates/plan-lecon.docx
```

### 4. GEMINI_API_KEY (OPTIONNEL)
**Description** : Clé API Google Gemini pour la génération de plans de leçons par IA

**Comment l'obtenir** :
1. Allez sur [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Créez une nouvelle clé API
3. Copiez la clé

**Note** : Sans cette clé, la fonctionnalité de génération IA ne sera pas disponible.

### 5. PORT (OPTIONNEL)
**Description** : Port d'écoute du serveur

**Valeur par défaut** : 3000

**Note** : Sur Vercel, cette variable est généralement gérée automatiquement.

## 📝 Comment Ajouter les Variables sur Vercel

### Méthode 1 : Via le Dashboard Vercel

1. Connectez-vous à [Vercel](https://vercel.com)
2. Sélectionnez votre projet "Plan-hebdomadaire-Primaire"
3. Allez dans **Settings** → **Environment Variables**
4. Pour chaque variable :
   - Cliquez sur "Add New"
   - Entrez le **Name** (ex: `MONGO_URL`)
   - Entrez la **Value** (la valeur de la variable)
   - Sélectionnez les environnements :
     - ✅ Production
     - ✅ Preview
     - ✅ Development
   - Cliquez sur "Save"
5. **Redéployez votre application** :
   - Allez dans **Deployments**
   - Cliquez sur les "..." du dernier déploiement
   - Sélectionnez "Redeploy"

### Méthode 2 : Via Vercel CLI

```bash
# Installer Vercel CLI
npm install -g vercel

# Se connecter
vercel login

# Ajouter une variable
vercel env add MONGO_URL production
# Puis collez votre valeur

# Redéployer
vercel --prod
```

## 🔍 Vérification

Après avoir configuré les variables et redéployé :

1. **Vérifier les logs** :
   - Allez dans **Deployments** → Sélectionnez le dernier déploiement
   - Cliquez sur "View Function Logs"
   - Recherchez les messages :
     ```
     ✅ MongoDB connected successfully
     📦 MONGO_URL configuré: ✅ Oui
     ```

2. **Tester l'application** :
   - Ouvrez votre site Vercel
   - Connectez-vous avec un compte valide
   - Sélectionnez une semaine
   - Si vous voyez les données → ✅ Succès !
   - Si vous voyez "Erreur MongoDB" → ❌ Vérifiez la configuration

## 🐛 Problèmes Courants

### Erreur : "MONGO_URL is not defined"
**Solution** :
- Vérifiez que vous avez bien ajouté `MONGO_URL` dans les variables d'environnement
- Vérifiez que vous avez sélectionné "Production" lors de l'ajout
- Redéployez l'application

### Erreur : "querySrv ENOTFOUND"
**Solutions** :
1. Vérifiez le format de votre `MONGO_URL`
2. Vérifiez que votre cluster MongoDB existe
3. Vérifiez que l'IP de Vercel est autorisée dans MongoDB Atlas :
   - Allez dans MongoDB Atlas → Network Access
   - Ajoutez `0.0.0.0/0` (permet toutes les IPs)
   - Ou ajoutez les IPs spécifiques de Vercel

### Erreur : "Failed to load resource: the server responded with a status of 500"
**Solutions** :
1. Vérifiez les logs dans Vercel (Deployments → Function Logs)
2. Vérifiez que toutes les variables requises sont définies
3. Testez votre connexion MongoDB avec MongoDB Compass

### Les templates Word ne fonctionnent pas
**Solutions** :
1. Vérifiez que les URLs sont publiques et accessibles
2. Testez les URLs dans votre navigateur (elles doivent télécharger le fichier)
3. Assurez-vous que les fichiers sont au format `.docx` valide

## 📊 Exemple de Configuration Complète

Voici un exemple de toutes les variables configurées :

```
MONGO_URL=mongodb+srv://admin:SecurePassword123@cluster0.abcde.mongodb.net/school-plans?retryWrites=true&w=majority
WORD_TEMPLATE_URL=https://github.com/user/repo/raw/main/templates/plan-hebdo.docx
LESSON_TEMPLATE_URL=https://github.com/user/repo/raw/main/templates/plan-lecon.docx
GEMINI_API_KEY=AIzaSyB1234567890abcdefghijklmnopqrstuv
PORT=3000
```

## 🔄 Après Modification

**Important** : Après toute modification des variables d'environnement :

1. Redéployez l'application (Vercel ne redéploie pas automatiquement)
2. Videz le cache de votre navigateur (Ctrl+Shift+R)
3. Testez l'application

## 📞 Support

Si les problèmes persistent après avoir suivi ce guide :
1. Vérifiez les logs Vercel en détail
2. Testez la connexion MongoDB localement avec les mêmes identifiants
3. Contactez le support technique avec les logs d'erreur

## 🎯 Checklist Rapide

- [ ] `MONGO_URL` ajoutée et testée
- [ ] `WORD_TEMPLATE_URL` ajoutée (si nécessaire)
- [ ] `LESSON_TEMPLATE_URL` ajoutée (si nécessaire)
- [ ] `GEMINI_API_KEY` ajoutée (si nécessaire)
- [ ] Variables ajoutées pour Production, Preview, Development
- [ ] Application redéployée
- [ ] Logs vérifiés (✅ MongoDB connected)
- [ ] Application testée et fonctionnelle
