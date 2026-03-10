# Configuration Vercel - Variables d'environnement

## 📋 Variables obligatoires

Allez dans **Settings → Environment Variables** de votre projet Vercel et ajoutez :

### 1️⃣ MongoDB
```
MONGO_URL = votre_url_mongodb_atlas
```

### 2️⃣ Templates Word
```
WORD_TEMPLATE_URL = https://url-de-votre-template-hebdomadaire.docx
LESSON_TEMPLATE_URL = https://url-de-votre-template-lesson.docx
```

### 3️⃣ Clés API Gemini (4 clés pour rotation automatique)

**🔴 IMPORTANT : CRÉEZ DE NOUVELLES CLÉS !**

Les anciennes clés fournies sont **COMPROMISES** (leaked) et **BLOQUÉES** par Google.

#### **Comment créer 4 nouvelles clés :**

1. Allez sur : https://aistudio.google.com/apikey
2. **Créez 4 PROJETS GOOGLE CLOUD différents** (pour maximiser le quota gratuit)
3. Pour chaque projet :
   - Cliquez sur **"Create API Key"**
   - Copiez la clé (format : `AIza...` avec 39 caractères)
   - **NE PARTAGEZ JAMAIS** ces clés (GitHub, Discord, email, etc.)

#### **Ajoutez-les sur Vercel :**

```
GEMINI_API_KEY_1 = [Votre nouvelle clé du projet 1]
GEMINI_API_KEY_2 = [Votre nouvelle clé du projet 2]
GEMINI_API_KEY_3 = [Votre nouvelle clé du projet 3]
GEMINI_API_KEY_4 = [Votre nouvelle clé du projet 4]
```

**⚠️ Sécurité** : 
- ✅ Les clés DOIVENT être dans les variables d'environnement Vercel
- ❌ NE JAMAIS mettre de vraies clés dans le code source
- ❌ NE JAMAIS commit/push de clés sur GitHub

**💡 Astuce** : Le système bascule automatiquement entre les 4 clés quand une atteint son quota. Si vous n'avez que 2 ou 3 clés, le système s'adaptera automatiquement.

### 4️⃣ VAPID Keys (Web Push Notifications)
```
VAPID_PUBLIC_KEY = votre_vapid_public_key
VAPID_PRIVATE_KEY = votre_vapid_private_key
```

### 5️⃣ Clé API Cron (optionnel)
```
CRON_API_KEY = votre_cle_securisee_pour_cron
```

## 🚀 Redéploiement

Après avoir ajouté les variables :
1. Cliquez sur **Save** pour chaque variable
2. Allez dans l'onglet **Deployments**
3. Cliquez sur **⋮** à côté du dernier déploiement
4. Sélectionnez **Redeploy**

## ✅ Vérification

Une fois déployé, vérifiez les logs Vercel :
- Vous devez voir : `✅ 4 clé(s) API Gemini configurée(s)`
- Pas de : `❌ ERREUR CRITIQUE: Aucune clé API Gemini valide`

## 🔄 Rotation automatique des clés

Le système fonctionne ainsi :
1. Utilise **GEMINI_API_KEY_1** pour la première génération
2. Si quota atteint (erreur 429) → passe à **GEMINI_API_KEY_2**
3. Si quota atteint → passe à **GEMINI_API_KEY_3**
4. Si quota atteint → passe à **GEMINI_API_KEY_4**
5. Si toutes épuisées → génère des fichiers d'erreur dans le ZIP

## 📊 Statistiques

Chaque ZIP généré contient un fichier récapitulatif avec :
```
🔑 UTILISATION DES CLÉS API GEMINI :
  GEMINI_1 : X génération(s)
  GEMINI_2 : Y génération(s)
  GEMINI_3 : Z génération(s)
  GEMINI_4 : W génération(s)
  Erreurs  : N échec(s)
```

## ⚡ Optimisation des performances

Les paramètres suivants ont été optimisés pour des générations rapides :
- **Temperature**: 0.7 (équilibre créativité/précision)
- **Max tokens**: 2048 (réponses concises)
- **Timeout**: 45 secondes par requête
- **Top P**: 0.95
- **Top K**: 40

## 🆘 Dépannage

### Problème : Toutes les générations échouent
- ✅ Vérifiez que les 4 clés sont valides sur https://aistudio.google.com/apikey
- ✅ Vérifiez les quotas quotidiens de chaque projet Google Cloud
- ✅ Attendez 24h pour la réinitialisation des quotas

### Problème : Temps de génération trop long
- Les 15 plans prennent ~4-5 minutes (normal avec Gemini Flash)
- Chaque plan prend 15-30 secondes
- Le système génère séquentiellement (pas en parallèle pour éviter les rate limits)

### Problème : Erreur "Cannot read properties of undefined"
- Cette erreur est maintenant corrigée dans le dernier commit
- Assurez-vous d'avoir redéployé après le commit

## 📞 Support

En cas de problème, vérifiez les logs Vercel pour identifier quelle clé pose problème.
