# 🔐 Guide de Sécurité des Clés API

## 🔴 Problème actuel : Clés compromises

Vos clés API Gemini actuelles ont été **exposées sur GitHub** et sont maintenant :
- ❌ Bloquées par Google (erreur 403 : "API key was reported as leaked")
- ❌ Quota épuisé
- ❌ Inutilisables

## ✅ Solution : Créer de nouvelles clés SÉCURISÉES

### Étape 1 : Créer 4 nouvelles clés API Gemini

1. **Allez sur** : https://aistudio.google.com/apikey

2. **Créez 4 PROJETS DIFFÉRENTS** (important pour maximiser les quotas) :
   ```
   Projet 1 : "Plans-Hebdomadaires-IA-1"
   Projet 2 : "Plans-Hebdomadaires-IA-2"
   Projet 3 : "Plans-Hebdomadaires-IA-3"
   Projet 4 : "Plans-Hebdomadaires-IA-4"
   ```

3. **Pour chaque projet** :
   - Cliquez sur **"Create API Key"**
   - Une clé sera générée (format : `AIzaSy...` avec 39 caractères)
   - **Copiez immédiatement** cette clé dans un fichier temporaire LOCAL
   - **NE LA PARTAGEZ NULLE PART** (pas GitHub, Discord, email, capture d'écran, etc.)

### Étape 2 : Configurer les clés sur Vercel (SÉCURISÉ)

1. **Connexion Vercel** :
   - Allez sur : https://vercel.com/dashboard
   - Sélectionnez votre projet : `plan-hebdomadaire-primaire`

2. **Accéder aux variables d'environnement** :
   - Cliquez sur **Settings** (onglet supérieur)
   - Cliquez sur **Environment Variables** (menu gauche)

3. **Modifier les 4 clés existantes** (ou créer si absentes) :

   | Nom de variable | Valeur | Environnements |
   |----------------|--------|----------------|
   | `GEMINI_API_KEY_1` | [Votre nouvelle clé projet 1] | Production, Preview, Development |
   | `GEMINI_API_KEY_2` | [Votre nouvelle clé projet 2] | Production, Preview, Development |
   | `GEMINI_API_KEY_3` | [Votre nouvelle clé projet 3] | Production, Preview, Development |
   | `GEMINI_API_KEY_4` | [Votre nouvelle clé projet 4] | Production, Preview, Development |

4. **Cliquez sur "Save"** pour chaque variable

5. **Redéployez le projet** :
   - Allez dans l'onglet **Deployments**
   - Cliquez sur **⋮** (3 points) à côté du dernier déploiement
   - Sélectionnez **Redeploy**
   - Attendez 1-2 minutes

### Étape 3 : Vérification

1. **Ouvrez les logs Vercel** :
   - Onglet **Deployments** → Dernier déploiement → **View Function Logs**

2. **Cherchez ces lignes** (SUCCÈS) :
   ```
   ✅ 4 clé(s) API Gemini valide(s) configurée(s)
      Clé 1: AIzaSyDL...xhPw
      Clé 2: AIzaSyB4...bhY
      Clé 3: AIzaSyAW...TiA
      Clé 4: AIzaSyC5...Pxc
   ```

3. **Si vous voyez ça (ÉCHEC)** :
   ```
   ❌ ERREUR CRITIQUE: Aucune clé API Gemini valide configurée !
   ```
   → Retournez à l'étape 2 et vérifiez que les clés sont bien enregistrées

### Étape 4 : Test de génération

1. **Connectez-vous à votre application**
2. **Sélectionnez une semaine** avec quelques lignes de données
3. **Cliquez sur "Générer les plans de leçon affichés"**
4. **Attendez 4-5 minutes** pour le téléchargement du ZIP

**Résultat attendu** :
- ✅ ZIP téléchargé avec des fichiers `.docx` (plans générés)
- ✅ Récapitulatif montrant l'utilisation des 4 clés
- ❌ Si erreurs 403/429 : vos nouvelles clés ont aussi un problème

## 🛡️ Bonnes pratiques de sécurité

### ✅ À FAIRE :
- ✅ Stocker les clés dans les **variables d'environnement Vercel**
- ✅ Utiliser 4 projets Google Cloud différents
- ✅ Créer des clés avec restrictions d'API (Generative Language API seulement)
- ✅ Surveiller l'utilisation des quotas sur Google Cloud Console
- ✅ Régénérer les clés tous les 3-6 mois

### ❌ À NE JAMAIS FAIRE :
- ❌ Mettre des clés dans le code source (fichiers .js, .env, etc.)
- ❌ Commit/push de clés sur GitHub
- ❌ Partager des clés par email, Discord, capture d'écran
- ❌ Utiliser la même clé dans plusieurs projets publics
- ❌ Hardcoder des clés dans les fichiers du repository

## 🚨 Que faire si une clé est compromise ?

1. **Détection** :
   - Erreur 403 : "API key was reported as leaked"
   - Email de Google : "Your API key is publicly exposed"
   - GitHub Security Alert

2. **Réaction immédiate** :
   - ✅ Allez sur Google Cloud Console
   - ✅ **Supprimez la clé compromise** (ne la désactivez pas, supprimez-la)
   - ✅ Créez une NOUVELLE clé
   - ✅ Mettez à jour la variable d'environnement Vercel
   - ✅ Redéployez immédiatement

3. **Vérification** :
   - Scannez votre historique Git : `git log --all --full-history --source -- "*API*"`
   - Si la clé est dans l'historique Git :
     - Option 1 : Utilisez `git filter-repo` pour la supprimer de l'historique
     - Option 2 : Archivez le repo et créez-en un nouveau (solution la plus sûre)

## 📊 Monitoring des quotas

### Quotas gratuits Gemini par projet :
- **Flash modèles** : 1500 requêtes/jour (gratuit)
- **Pro modèles** : 50 requêtes/jour (gratuit)

### Calcul pour votre usage :
- Génération de 15 plans = 15 requêtes
- Avec 4 projets = 6000 requêtes/jour (4 × 1500)
- **Soit ~400 générations de 15 plans par jour** (largement suffisant)

### Vérifier l'utilisation :
1. Allez sur : https://console.cloud.google.com/
2. Sélectionnez le projet
3. Navigation Menu → **APIs & Services** → **Enabled APIs**
4. Cliquez sur **Generative Language API**
5. Onglet **Quotas** pour voir l'utilisation

## 🆘 Dépannage

### Problème : "API key not valid"
- ✅ Vérifiez que la clé a 39 caractères et commence par `AIza`
- ✅ Vérifiez que **Generative Language API** est activée sur le projet
- ✅ Attendez 5 minutes après création (propagation)

### Problème : "Quota exceeded" sur toutes les clés
- ⏰ Attendez 24h (réinitialisation à minuit UTC)
- 💰 Passez à un plan payant Google Cloud (non recommandé au début)
- 🔑 Créez 4 nouveaux projets avec 4 nouvelles clés

### Problème : "Permission denied"
- ✅ Vérifiez que l'API est activée
- ✅ Créez une nouvelle clé (pas de restriction d'API)
- ✅ Vérifiez les permissions du projet Google Cloud

## 📞 Support

En cas de problème persistant :
1. Vérifiez les logs Vercel (section Function Logs)
2. Cherchez les messages d'erreur avec `❌` ou `🔴`
3. Consultez ce guide de sécurité
4. Si nécessaire, recréez un nouveau set de 4 clés

---

**Rappel** : La sécurité des clés API est CRUCIALE. Une clé compromise peut :
- Être utilisée par n'importe qui (épuise votre quota)
- Générer des coûts non prévus
- Être bloquée définitivement par Google
