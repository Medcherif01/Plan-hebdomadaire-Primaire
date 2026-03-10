# ✅ Checklist de Test - Génération Plans de Leçon

## 📋 Tests à Effectuer Après Déploiement

### ✅ Test 1 : Vérification Configuration API

**Objectif** : Confirmer que les 4 clés Gemini sont actives

**Étapes** :
1. Aller sur https://vercel.com/dashboard
2. Sélectionner votre projet
3. Onglet **Deployments** → Cliquer sur le dernier (marqué ✅ Ready)
4. Onglet **Functions** → `/api/generate-multiple-ai-lesson-plans`
5. Chercher dans les logs :

**✅ Résultat Attendu** :
```
✅ 4 clé(s) API Gemini valide(s) configurée(s)
  ├─ Clé 1: AIzaSyCM...uPEQ ✅
  ├─ Clé 2: AIzaSyCu...dxYU ✅
  ├─ Clé 3: AIzaSyA9...nZp4 ✅
  └─ Clé 4: AIzaSyCT...whFg ✅
```

**❌ Si vous voyez** :
```
❌ AUCUNE clé API Gemini valide trouvée !
```
→ Vérifier Settings → Environment Variables (voir INSTRUCTIONS_DEPLOIEMENT.md)

---

### ✅ Test 2 : Génération Individuelle (Bouton 💾)

**Objectif** : Vérifier la génération d'un seul plan

**Étapes** :
1. Se connecter à l'application
2. Sélectionner **Semaine 28**
3. Trouver une ligne avec :
   - Enseignant : Fatima
   - Classe : PP3
   - Matière : Français
   - Leçon : (doit avoir du contenu, >3 caractères)
4. Cliquer sur l'icône **💾 (disquette)** à droite de cette ligne
5. Attendre ~15-30 secondes

**✅ Résultat Attendu** :
```
Téléchargement: Francais_PP3_S28_P1_Fatima.docx
Taille: ~50-150 Ko
```

**🔍 Vérifications** :
- [ ] Fichier .docx téléchargé
- [ ] Nom correct : `{Matiere}_{Classe}_S{Semaine}_P{Periode}_{Enseignant}.docx`
- [ ] Ouverture Word réussie
- [ ] Contenu présent :
  - [ ] Titre d'unité rempli
  - [ ] Objectifs listés (avec tirets -)
  - [ ] 4 étapes (Introduction, Activité Principale, Synthèse, Clôture)
  - [ ] Devoirs suggérés
  - [ ] Différenciation pédagogique

**❌ Si Erreur** :
- Message d'erreur : _________________________________
- Logs Vercel Functions → Copier et poster dans chat

---

### ✅ Test 3 : Génération Multiple (Bouton Violet 📦)

**Objectif** : Vérifier la génération en lot (ZIP)

**Préparation** :
1. Sélectionner **Semaine 28**
2. **Cocher 5-8 lignes** qui ont du contenu de leçon
   - Suggestion : Prendre des lignes de Fatima (PP3) en Français, Sciences, etc.

**Étapes** :
1. Cliquer sur **bouton violet** "Générer les plans de leçon affichés"
2. Modal de confirmation s'affiche
3. Cliquer **"Générer X plans de leçon"**
4. **Attendre 2-4 minutes** (ne PAS fermer la page)
   - Barre de progression visible
   - Compteur "X/Y plans générés"

**✅ Résultat Attendu** :
```
Téléchargement: Plans_Lecon_IA_S28_8_fichiers.zip
Taille: ~400-1200 Ko (selon nombre)
```

**🔍 Vérifications du ZIP** :
- [ ] Fichier ZIP téléchargé
- [ ] Nom correct : `Plans_Lecon_IA_S{Semaine}_{Nombre}_fichiers.zip`
- [ ] Extraction réussie

**Contenu Attendu** :
```
Plans_Lecon_IA_S28_8_fichiers/
├── Francais_PP3_S28_P1_Fatima.docx       ✅
├── Francais_PP3_S28_P2_Fatima.docx       ✅
├── Sciences_PP3_S28_P3_Fatima.docx       ✅
├── Mathematiques_PP3_S28_P4_Fatima.docx  ✅
├── ... (autres .docx selon sélection)    ✅
├── 99_RECAPITULATIF.txt                  ✅
└── (OPTIONNEL) 00_LIGNES_IGNOREES.txt    ⚠️
```

**❌ Fichiers à NE PAS voir** :
```
❌ ERREUR_Fatima_PP3_Francais.txt    ← Si présent = problème parsing
❌ ERREUR_*_*_*.txt                  ← Aucun fichier d'erreur attendu
```

---

### ✅ Test 4 : Analyse du Récapitulatif

**Étapes** :
1. Ouvrir le ZIP
2. Ouvrir `99_RECAPITULATIF.txt`

**✅ Contenu Attendu** :
```
========================================
📊 RÉCAPITULATIF GÉNÉRATION IA
========================================

📅 Date: 2026-03-10
📌 Semaine: 28
🤖 Fournisseur: Gemini (Fallback automatique sur 4 clés)

========================================
📈 STATISTIQUES
========================================
Total lignes reçues: 8
Lignes valides: 8
Lignes ignorées (vides): 0

✅ Générations réussies: 8    ← DEVRAIT ÊTRE 100%
❌ Erreurs: 0                  ← DEVRAIT ÊTRE 0

📊 Taux de réussite: 100.00%  ← OBJECTIF: 95-100%

========================================
🔑 UTILISATION DES CLÉS API
========================================
GEMINI_1: 8 générations        ← Toutes sur clé 1 = OK
GEMINI_2: 0 générations
GEMINI_3: 0 générations
GEMINI_4: 0 générations
Total erreurs: 0               ← DEVRAIT ÊTRE 0
```

**🔍 Points à Vérifier** :
- [ ] Taux de réussite = **100%** (ou au minimum 95%)
- [ ] Total erreurs = **0** (ou maximum 1-2 sur 10+)
- [ ] Utilisation clés : Principalement GEMINI_1, puis 2-3-4 si quotas

**⚠️ Si Taux < 95%** :
- Copier le contenu complet de `99_RECAPITULATIF.txt`
- Lister les fichiers `ERREUR_*.txt` présents
- Ouvrir 1-2 fichiers `ERREUR_*.txt` et copier leur contenu
- Poster tout ça dans le chat pour analyse

---

### ✅ Test 5 : Vérification Qualité .docx

**Étapes** :
1. Ouvrir **3 fichiers .docx aléatoires** du ZIP
2. Vérifier pour chaque :

**Champs Obligatoires** :
- [ ] **Semaine** : 28
- [ ] **Matière** : Français / Sciences / etc.
- [ ] **Classe** : PP3 / PP4 / etc.
- [ ] **Leçon** : Le thème exact de la ligne
- [ ] **Jour** : Lundi / Mardi / etc.
- [ ] **Date** : Format français (ex: Lundi 31 mars 2026)
- [ ] **Séance** : P1 / P2 / P3 / etc.

**Contenu Pédagogique** :
- [ ] **Titre d'Unité** : Pertinent et en lien avec la leçon
- [ ] **Méthodes** : Au moins 2-3 méthodes listées
- [ ] **Outils** : Matériel et outils mentionnés
- [ ] **Objectifs** : 3-5 objectifs avec tirets `-`
- [ ] **Étapes** (4 phases) :
  - [ ] Introduction (~5 min)
  - [ ] Activité Principale (~25 min)
  - [ ] Synthèse (~10 min)
  - [ ] Clôture (~5 min)
- [ ] **Ressources** : Manuels, sites, etc.
- [ ] **Devoirs** : Suggestions concrètes
- [ ] **Différenciation** :
  - [ ] DiffLents (apprenants en difficulté)
  - [ ] DiffTresPerf (apprenants performants)
  - [ ] DiffTous (toute la classe)

**Qualité du Texte** :
- [ ] Langue correcte (FR/EN/AR selon enseignant)
- [ ] Pas de texte comme `{TitreUnite}` ou `undefined`
- [ ] Pas de caractères bizarres (��, \n, \\, etc.)
- [ ] Pas de guillemets doubles orphelins `"texte"texte"`
- [ ] Texte cohérent et professionnel

---

### ✅ Test 6 : Test de Charge (Optionnel)

**Objectif** : Vérifier rotation des clés Gemini

**Étapes** :
1. Sélectionner **Semaine 27**
2. Cocher **15-20 lignes** avec contenu
3. Lancer génération ZIP
4. Attendre ~5-7 minutes

**✅ Résultat Attendu** :
```
Plans_Lecon_IA_S27_18_fichiers.zip

Récapitulatif:
  ✅ Générations réussies: 17-18
  ❌ Erreurs: 0-1
  📊 Taux de réussite: 94-100%

Utilisation clés:
  GEMINI_1: 15 générations   ← Quota proche max
  GEMINI_2: 2 générations    ← Fallback activé
  GEMINI_3: 1 génération     ← Si GEMINI_2 épuisée
  GEMINI_4: 0 génération
```

**🔍 Observations** :
- [ ] Rotation automatique fonctionne
- [ ] Pas de message "QUOTA ÉPUISÉ" général
- [ ] Majorité des plans générés malgré quotas

---

## 📊 Tableau de Résultats

Remplir après tests :

| Test | Status | Taux Réussite | Commentaires |
|------|--------|---------------|--------------|
| 1. Config API | ☐ ✅ ☐ ❌ | N/A | ___________ |
| 2. Génération Indiv | ☐ ✅ ☐ ❌ | N/A | ___________ |
| 3. Génération ZIP | ☐ ✅ ☐ ❌ | ___% | ___________ |
| 4. Récapitulatif | ☐ ✅ ☐ ❌ | ___% | ___________ |
| 5. Qualité .docx | ☐ ✅ ☐ ❌ | N/A | ___________ |
| 6. Test Charge (opt) | ☐ ✅ ☐ ❌ | ___% | ___________ |

**Critères de Validation** :
- ✅ **SUCCÈS COMPLET** : Tous tests ✅, taux réussite ≥95%
- ⚠️ **SUCCÈS PARTIEL** : Quelques erreurs, taux réussite 80-94%
- ❌ **ÉCHEC** : Majorité échecs, taux réussite <80%

---

## 🐛 Problèmes Courants & Solutions

### Problème 1 : Quota Épuisé (Toutes Clés)
**Symptôme** : `⚠️ Quota API épuisé`  
**Solution** :
- Option A : Attendre 24h (quotas reset minuit PST)
- Option B : Créer 4 nouvelles clés Gemini
- Option C : Générer en petits lots (5-8 max)

### Problème 2 : Clé Leaked (403)
**Symptôme** : `HTTP 403 - Your API key was reported as leaked`  
**Solution** :
- Supprimer clé sur https://console.cloud.google.com
- Créer nouvelle clé sur https://aistudio.google.com/apikey
- Remplacer dans Vercel → Redéployer

### Problème 3 : Parsing JSON Échoue
**Symptôme** : Fichiers `ERREUR_*.txt` dans ZIP  
**Solution** :
- Ouvrir 1 fichier `ERREUR_*.txt`
- Copier contenu complet
- Aller sur Vercel → Functions → Logs
- Chercher lignes avec `❌ Parsing JSON échoue`
- Copier JSON original + contexte erreur
- Poster dans chat pour analyse

### Problème 4 : Génération Lente
**Symptôme** : >5 min pour 8 plans  
**Cause** :
- Quotas proches limite → Rate limiting
- Contenu leçon très long → Génération lente
- Connexion instable → Retries multiples  
**Solution** :
- Réduire nombre plans par lot (5-6 max)
- Vérifier logs pour voir temps individuels
- Ajouter plus de clés API si quotas problème

### Problème 5 : .docx Corrompu
**Symptôme** : Word refuse d'ouvrir le fichier  
**Solution** :
- Vérifier taille fichier (devrait être 50-150 Ko)
- Si <10 Ko → Erreur génération
- Ouvrir ZIP, chercher `ERREUR_*_*.txt` correspondant
- Poster contenu erreur dans chat

---

## ✅ Validation Finale

**Cocher quand** :
- [ ] Test 1 : 4 clés configurées ✅
- [ ] Test 2 : Génération individuelle fonctionne ✅
- [ ] Test 3 : Génération ZIP fonctionne ✅
- [ ] Test 4 : Taux réussite ≥95% ✅
- [ ] Test 5 : Qualité .docx excellente ✅
- [ ] Aucun fichier `ERREUR_*.txt` (ou max 1-2 sur 10+) ✅

**🎉 SI TOUS COCHÉS** → Solution validée, système opérationnel !

**⚠️ SI PROBLÈMES** → Poster dans chat :
1. Résultats du tableau ci-dessus
2. Contenu `99_RECAPITULATIF.txt`
3. Logs Vercel Functions (avec ❌)
4. Contenu fichiers `ERREUR_*.txt` si présents

---

**Date Test** : _________________  
**Testeur** : _________________  
**Statut Final** : ☐ ✅ VALIDÉ  ☐ ⚠️ PARTIEL  ☐ ❌ ÉCHEC
