-- ─── Seed : Workflow Engine v2 ────────────────────────────────────────────────
-- Exécuter sur une DB avec les migrations 082 + 083 appliquées.
-- Idempotent : utilise DO $$ … $$ avec des variables locales.
-- Adapte automatiquement au premier business trouvé.
--
-- Usage :
--   supabase db reset            (repart de zéro)
--   psql $DATABASE_URL -f supabase/seeds/084_workflow_seed.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_business_id   UUID := '3bc74a66-5f87-4fb4-8944-7af2feea2097';
  v_dossier_id    UUID  := gen_random_uuid();  -- dossier de test
  v_dossier2_id   UUID  := gen_random_uuid();

  -- Workflows
  v_wf_recouvrement_id  UUID;
  v_wf_mise_en_demeure_id UUID;

  -- Instances
  v_inst_running_id   UUID;
  v_inst_waiting_id   UUID;
  v_inst_paused_id    UUID;
  v_inst_completed_id UUID;
  v_inst_failed_id    UUID;

  -- Définition workflow 1 : Recouvrement de créance
  -- Nœuds : START(USER_TASK) → CONDITION → [ACTION email] → WAIT_EVENT → LEGAL_CLAIM → END
  --                                      ↘ [END refus]
  v_def_recouvrement JSONB := '{
    "initial_node_id": "n_intake",
    "nodes": [
      {
        "id": "n_intake",
        "type": "USER_TASK",
        "label": "Saisie dossier client",
        "description": "Recueillir les informations du créancier et de la créance",
        "due_hours": 24,
        "position": {"x": 80, "y": 160},
        "form_fields": [
          {"key": "client_name",   "label": "Nom du client",          "type": "text",   "required": true},
          {"key": "client_phone",  "label": "Téléphone",              "type": "phone",  "required": true},
          {"key": "client_email",  "label": "Email",                  "type": "email",  "required": false},
          {"key": "montant",       "label": "Montant de la créance",  "type": "number", "required": true},
          {"key": "devise",        "label": "Devise",                 "type": "select", "required": true,
           "options": ["XOF","EUR","USD"], "default": "XOF"},
          {"key": "date_echeance", "label": "Date d''échéance",       "type": "date",   "required": true},
          {"key": "description",   "label": "Nature de la créance",   "type": "textarea"}
        ]
      },
      {
        "id": "n_check_montant",
        "type": "CONDITION",
        "label": "Montant suffisant ?",
        "description": "Vérifie si la créance justifie une procédure",
        "position": {"x": 360, "y": 160}
      },
      {
        "id": "n_notif_email",
        "type": "ACTION",
        "label": "Notification dossier ouvert",
        "on_error": "CONTINUE",
        "position": {"x": 600, "y": 80},
        "actions": [
          {
            "type": "SEND_EMAIL",
            "to": "client_email",
            "subject": "Votre dossier de recouvrement {{reference}} est ouvert",
            "template": "Bonjour {{client_name}},\n\nVotre dossier de recouvrement pour un montant de {{montant}} {{devise}} a bien été ouvert.\n\nNous vous contacterons prochainement.\n\nCordialement"
          },
          {
            "type": "CREATE_TRACKING_LINK",
            "to": "client_phone"
          }
        ]
      },
      {
        "id": "n_attente_reponse",
        "type": "WAIT_EVENT",
        "label": "Attente réponse débiteur",
        "description": "En attente de la réponse du débiteur (WhatsApp ou email)",
        "event_key": "debtor_reply",
        "timeout_hours": 72,
        "timeout_edge_id": "e_timeout",
        "position": {"x": 860, "y": 80}
      },
      {
        "id": "n_mise_en_demeure",
        "type": "LEGAL_CLAIM",
        "label": "Mise en demeure",
        "template": "MISE EN DEMEURE\n\nLe {{date_jour}},\n\nNous, soussignés {{avocat_nom}}, Avocat au Barreau de Dakar,\nagissant au nom et pour le compte de notre client {{client_name}},\n\nMettons en demeure {{debiteur_nom}} de nous payer dans les 48 heures\nla somme de {{montant}} {{devise}},\n\nreprésentant {{description}}.\n\nA défaut de règlement dans ce délai, nous nous réservons le droit\nd''engager toute procédure judiciaire utile.\n\nMaître {{avocat_nom}}",
        "pretention_id": null,
        "share_method": "WHATSAPP_SHARE",
        "phone_field": "client_phone",
        "document_name": "Mise en demeure",
        "position": {"x": 1120, "y": 80}
      },
      {
        "id": "n_fin_succes",
        "type": "END",
        "label": "Dossier clôturé — Paiement reçu",
        "outcome": "SUCCESS",
        "message": "Le débiteur a réglé la créance.",
        "position": {"x": 1380, "y": 80}
      },
      {
        "id": "n_fin_refus",
        "type": "END",
        "label": "Dossier classé — Montant insuffisant",
        "outcome": "FAILURE",
        "message": "La créance est inférieure au seuil de prise en charge.",
        "position": {"x": 360, "y": 300}
      }
    ],
    "edges": [
      {
        "id": "e_saisie_vers_check",
        "from": "n_intake",
        "to": "n_check_montant",
        "label": "Valider le dossier"
      },
      {
        "id": "e_montant_ok",
        "from": "n_check_montant",
        "to": "n_notif_email",
        "label": "Montant suffisant (≥ 50 000 XOF)",
        "condition": {
          "all": [
            {"fact": "montant", "operator": "gte", "value": 50000}
          ]
        }
      },
      {
        "id": "e_montant_insuffisant",
        "from": "n_check_montant",
        "to": "n_fin_refus",
        "label": "Montant insuffisant",
        "is_default": true
      },
      {
        "id": "e_notif_vers_attente",
        "from": "n_notif_email",
        "to": "n_attente_reponse",
        "label": "En attente"
      },
      {
        "id": "e_reponse_positive",
        "from": "n_attente_reponse",
        "to": "n_fin_succes",
        "label": "Paiement confirmé",
        "requires_confirmation": true
      },
      {
        "id": "e_timeout",
        "from": "n_attente_reponse",
        "to": "n_mise_en_demeure",
        "label": "Aucune réponse — Envoyer mise en demeure"
      },
      {
        "id": "e_med_envoyee",
        "from": "n_mise_en_demeure",
        "to": "n_fin_succes",
        "label": "Document envoyé — Clôturer",
        "requires_confirmation": true
      }
    ]
  }';

  -- Définition workflow 2 : Mise en demeure simple
  -- Nœuds : USER_TASK → DELAY(48h) → LEGAL_CLAIM → USER_TASK confirmation → END
  v_def_med JSONB := '{
    "initial_node_id": "n_collect",
    "nodes": [
      {
        "id": "n_collect",
        "type": "USER_TASK",
        "label": "Collecte des informations",
        "due_hours": 8,
        "position": {"x": 80, "y": 160},
        "form_fields": [
          {"key": "debiteur_nom",    "label": "Nom du débiteur",       "type": "text",   "required": true},
          {"key": "debiteur_adresse","label": "Adresse du débiteur",   "type": "textarea","required": true},
          {"key": "montant",         "label": "Somme réclamée (XOF)",  "type": "number", "required": true},
          {"key": "motif",           "label": "Motif",                 "type": "select", "required": true,
           "options": ["Loyer impayé","Facture impayée","Prêt non remboursé","Autre"]}
        ]
      },
      {
        "id": "n_delai_reflexion",
        "type": "DELAY",
        "label": "Délai de réflexion 48h",
        "delay_hours": 48,
        "delay_label": "Attente 48h avant envoi",
        "position": {"x": 340, "y": 160}
      },
      {
        "id": "n_redaction",
        "type": "LEGAL_CLAIM",
        "label": "Rédaction mise en demeure",
        "template": "LETTRE DE MISE EN DEMEURE\nDakar, le {{date_jour}}\n\nA {{debiteur_nom}}\n{{debiteur_adresse}}\n\nMonsieur/Madame,\n\nPar la présente, nous vous mettons en demeure de régler\nla somme de {{montant}} FCFA correspondant à : {{motif}}.\n\nVous disposez de 8 jours à compter de la réception\nde cette lettre pour vous acquitter de cette somme.\n\nPassé ce délai, nous saisirons le Tribunal compétent.",
        "share_method": "WHATSAPP_SHARE",
        "phone_field": "client_phone",
        "document_name": "Lettre de mise en demeure",
        "position": {"x": 600, "y": 160}
      },
      {
        "id": "n_confirmation",
        "type": "USER_TASK",
        "label": "Confirmation d''envoi",
        "description": "Confirmer que la mise en demeure a bien été transmise au débiteur",
        "due_hours": 4,
        "position": {"x": 860, "y": 160},
        "form_fields": [
          {"key": "mode_envoi",   "label": "Mode d''envoi",      "type": "select", "required": true,
           "options": ["WhatsApp","Email","Courrier recommandé","Remise en main propre"]},
          {"key": "date_envoi",   "label": "Date d''envoi",      "type": "date",   "required": true},
          {"key": "accuse_reception", "label": "Accusé reçu",    "type": "boolean"}
        ]
      },
      {
        "id": "n_fin",
        "type": "END",
        "label": "Mise en demeure envoyée",
        "outcome": "SUCCESS",
        "position": {"x": 1100, "y": 160}
      }
    ],
    "edges": [
      {"id": "e1", "from": "n_collect",        "to": "n_delai_reflexion", "label": "Valider"},
      {"id": "e2", "from": "n_delai_reflexion", "to": "n_redaction",      "label": "Délai écoulé"},
      {"id": "e3", "from": "n_redaction",       "to": "n_confirmation",   "label": "Document prêt"},
      {"id": "e4", "from": "n_confirmation",    "to": "n_fin",            "label": "Envoi confirmé", "requires_confirmation": true}
    ]
  }';

BEGIN

  -- ── 0. Business cible ────────────────────────────────────────────────────────
  v_business_id := '3bc74a66-5f87-4fb4-8944-7af2feea2097';

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = v_business_id) THEN
    RAISE EXCEPTION 'Business % introuvable.', v_business_id;
  END IF;

  RAISE NOTICE 'Seeding workflows pour business %', v_business_id;

  -- ── 1. Nettoyer les seeds précédents (idempotence) ──────────────────────────
  DELETE FROM workflows
    WHERE business_id = v_business_id
      AND name IN ('Recouvrement de créance', 'Mise en demeure simple');

  -- ── 2. Créer les workflows ──────────────────────────────────────────────────

  INSERT INTO workflows (business_id, name, description, definition, version, is_active)
  VALUES (
    v_business_id,
    'Recouvrement de créance',
    'Processus complet de recouvrement : saisie → notification → attente réponse → mise en demeure',
    v_def_recouvrement,
    1,
    true
  )
  RETURNING id INTO v_wf_recouvrement_id;

  INSERT INTO workflows (business_id, name, description, definition, version, is_active)
  VALUES (
    v_business_id,
    'Mise en demeure simple',
    'Rédaction et envoi d''une mise en demeure avec délai de réflexion',
    v_def_med,
    1,
    true
  )
  RETURNING id INTO v_wf_mise_en_demeure_id;

  RAISE NOTICE 'Workflows créés : % et %', v_wf_recouvrement_id, v_wf_mise_en_demeure_id;

  -- ── 3. Prétentions ──────────────────────────────────────────────────────────
  DELETE FROM pretentions
    WHERE business_id = v_business_id
      AND name IN (
        'Mise en demeure — Loyer impayé',
        'Relance amiable',
        'Commandement de payer',
        'Attestation de créance'
      );

  INSERT INTO pretentions (business_id, name, category, description, template, variables, tags, is_active)
  VALUES
  (
    v_business_id,
    'Mise en demeure — Loyer impayé',
    'Recouvrement',
    'Modèle standard de mise en demeure pour loyer impayé',
    'MISE EN DEMEURE

Dakar, le {{date_jour}}

A {{locataire_nom}}
{{locataire_adresse}}

Objet : Mise en demeure de payer — Loyer impayé

Monsieur/Madame {{locataire_nom}},

Nous vous rappelons que vous êtes redevable envers notre client {{bailleur_nom}} de la somme de {{montant}} FCFA correspondant aux loyers des mois de {{periode}} restés impayés.

Malgré nos relances amiables, cette somme demeure due à ce jour.

En conséquence, nous vous METTONS EN DEMEURE de régler l''intégralité de cette somme dans un délai de HUIT (8) JOURS à compter de la réception de la présente.

A défaut, nous nous verrons dans l''obligation d''engager toute procédure judiciaire utile au recouvrement de cette créance, y compris une procédure en référé, à vos risques et frais.

Veuillez agréer, Monsieur/Madame, l''expression de nos salutations distinguées.

Maître {{avocat_nom}}
Avocat au Barreau de Dakar',
    '[
      {"key": "locataire_nom",     "label": "Nom du locataire",   "type": "text",     "required": true},
      {"key": "locataire_adresse", "label": "Adresse du locataire","type": "textarea", "required": true},
      {"key": "bailleur_nom",      "label": "Nom du bailleur",    "type": "text",     "required": true},
      {"key": "montant",           "label": "Montant dû (FCFA)",  "type": "number",   "required": true},
      {"key": "periode",           "label": "Période concernée",  "type": "text",     "required": true},
      {"key": "date_jour",         "label": "Date du jour",       "type": "date",     "required": true},
      {"key": "avocat_nom",        "label": "Nom de l''avocat",   "type": "text",     "required": true}
    ]',
    ARRAY['loyer','mise_en_demeure','recouvrement','immobilier'],
    true
  ),
  (
    v_business_id,
    'Relance amiable',
    'Recouvrement',
    'Lettre de relance avant procédure, ton courtois',
    'LETTRE DE RELANCE AMIABLE

Dakar, le {{date_jour}}

A {{debiteur_nom}}

Objet : Relance amiable — Facture {{reference_facture}}

Monsieur/Madame,

Sauf erreur ou omission de notre part, nous constatons que la facture n° {{reference_facture}} d''un montant de {{montant}} FCFA, arrivée à échéance le {{date_echeance}}, demeure impayée à ce jour.

Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais, en effectuant votre règlement par {{mode_paiement}}.

Dans l''hypothèse où ce règlement aurait déjà été effectué, veuillez considérer ce courrier comme sans objet.

Cordialement,
{{expediteur_nom}}',
    '[
      {"key": "debiteur_nom",       "label": "Nom du débiteur",      "type": "text",   "required": true},
      {"key": "reference_facture",  "label": "Référence facture",    "type": "text",   "required": true},
      {"key": "montant",            "label": "Montant (FCFA)",       "type": "number", "required": true},
      {"key": "date_echeance",      "label": "Date d''échéance",     "type": "date",   "required": true},
      {"key": "mode_paiement",      "label": "Mode de paiement",     "type": "select", "required": true},
      {"key": "date_jour",          "label": "Date du jour",         "type": "date",   "required": true},
      {"key": "expediteur_nom",     "label": "Nom de l''expéditeur", "type": "text",   "required": true}
    ]',
    ARRAY['relance','amiable','facture','recouvrement'],
    true
  ),
  (
    v_business_id,
    'Commandement de payer',
    'Procédure judiciaire',
    'Commandement de payer avant saisie immobilière',
    'COMMANDEMENT DE PAYER VALANT MISE EN DEMEURE

L''an {{annee}} et le {{date_jour}},

A la requête de {{creancier_nom}}, demeurant à {{creancier_adresse}},

Ayant pour Avocat Maître {{avocat_nom}}, Avocat au Barreau de Dakar,

Nous, Huissier de Justice soussigné, avons COMMANDÉ ET COMMANDONS à :

{{debiteur_nom}}, demeurant à {{debiteur_adresse}},

De payer dans un délai de TRENTE (30) JOURS la somme totale de {{montant_total}} FCFA se décomposant comme suit :
- Principal : {{montant_principal}} FCFA
- Intérêts : {{montant_interets}} FCFA
- Frais : {{montant_frais}} FCFA

Faute de quoi il sera procédé à toutes voies de droit.',
    '[
      {"key": "creancier_nom",       "label": "Nom du créancier",     "type": "text",   "required": true},
      {"key": "creancier_adresse",   "label": "Adresse créancier",    "type": "textarea","required": true},
      {"key": "debiteur_nom",        "label": "Nom du débiteur",      "type": "text",   "required": true},
      {"key": "debiteur_adresse",    "label": "Adresse débiteur",     "type": "textarea","required": true},
      {"key": "avocat_nom",          "label": "Nom de l''avocat",     "type": "text",   "required": true},
      {"key": "montant_total",       "label": "Montant total (FCFA)", "type": "number", "required": true},
      {"key": "montant_principal",   "label": "Principal (FCFA)",     "type": "number", "required": true},
      {"key": "montant_interets",    "label": "Intérêts (FCFA)",      "type": "number", "required": false},
      {"key": "montant_frais",       "label": "Frais (FCFA)",         "type": "number", "required": false},
      {"key": "date_jour",           "label": "Date du commandement", "type": "date",   "required": true},
      {"key": "annee",               "label": "Année",                "type": "text",   "required": true}
    ]',
    ARRAY['commandement','saisie','judiciaire','immeuble'],
    true
  ),
  (
    v_business_id,
    'Attestation de créance',
    'Documents officiels',
    'Attestation certifiant l''existence d''une créance',
    'ATTESTATION DE CRÉANCE

Je soussigné(e), Maître {{avocat_nom}},
Avocat au Barreau de Dakar,
Demeurant à {{avocat_adresse}},

ATTESTE

Que notre client {{client_nom}} est titulaire d''une créance certaine, liquide et exigible
à l''encontre de {{debiteur_nom}} d''un montant de {{montant}} FCFA ({{montant_lettres}}),

Au titre de : {{motif_creance}}

La présente attestation est établie pour servir et valoir ce que de droit.

Dakar, le {{date_jour}}

Maître {{avocat_nom}}
(Signature et cachet)',
    '[
      {"key": "avocat_nom",       "label": "Nom de l''avocat",      "type": "text",    "required": true},
      {"key": "avocat_adresse",   "label": "Adresse de l''avocat",  "type": "textarea","required": true},
      {"key": "client_nom",       "label": "Nom du client",         "type": "text",    "required": true},
      {"key": "debiteur_nom",     "label": "Nom du débiteur",       "type": "text",    "required": true},
      {"key": "montant",          "label": "Montant (FCFA)",        "type": "number",  "required": true},
      {"key": "montant_lettres",  "label": "Montant en lettres",    "type": "text",    "required": true},
      {"key": "motif_creance",    "label": "Motif de la créance",   "type": "textarea","required": true},
      {"key": "date_jour",        "label": "Date du jour",          "type": "date",    "required": true}
    ]',
    ARRAY['attestation','créance','officiel','certification'],
    true
  );

  RAISE NOTICE '4 prétentions insérées';

  -- ── 4. Instances dans différents états ──────────────────────────────────────

  -- Instance 1 : WAITING — en attente de réponse débiteur (nœud WAIT_EVENT)
  INSERT INTO workflow_instances (
    dossier_id, workflow_id, workflow_version, workflow_snapshot,
    current_node_id, context, status,
    triggered_by, started_at
  ) VALUES (
    v_dossier_id,
    v_wf_recouvrement_id, 1, v_def_recouvrement,
    'n_attente_reponse',
    '{
      "reference":     "DOS-2024-001",
      "client_name":   "Amadou Diallo",
      "client_phone":  "+221771234567",
      "client_email":  "amadou.diallo@example.com",
      "montant":       750000,
      "devise":        "XOF",
      "date_echeance": "2024-10-01",
      "description":   "Loyers impayés sur 3 mois"
    }',
    'WAITING',
    'MANUAL',
    now() - INTERVAL '2 days'
  ) RETURNING id INTO v_inst_waiting_id;

  -- Instance 2 : RUNNING — à l''étape de saisie initiale
  INSERT INTO workflow_instances (
    dossier_id, workflow_id, workflow_version, workflow_snapshot,
    current_node_id, context, status,
    triggered_by, started_at
  ) VALUES (
    v_dossier_id,
    v_wf_recouvrement_id, 1, v_def_recouvrement,
    'n_intake',
    '{"reference": "DOS-2024-002"}',
    'RUNNING',
    'MANUAL',
    now() - INTERVAL '1 hour'
  ) RETURNING id INTO v_inst_running_id;

  -- Instance 3 : PAUSED — délai en cours (workflow mise en demeure)
  INSERT INTO workflow_instances (
    dossier_id, workflow_id, workflow_version, workflow_snapshot,
    current_node_id, context, status,
    triggered_by, started_at, paused_at, scheduled_resume_at
  ) VALUES (
    v_dossier2_id,
    v_wf_mise_en_demeure_id, 1, v_def_med,
    'n_delai_reflexion',
    '{
      "reference":          "DOS-2024-003",
      "client_name":        "Fatou Sow",
      "client_phone":       "+221776543210",
      "debiteur_nom":       "Entreprise SARL Diop & Fils",
      "debiteur_adresse":   "Zone industrielle de Mbao, Dakar",
      "montant":            1200000,
      "motif":              "Facture impayée"
    }',
    'PAUSED',
    'ON_DOSSIER_CREATE',
    now() - INTERVAL '5 hours',
    now() - INTERVAL '5 hours',
    now() + INTERVAL '43 hours'
  ) RETURNING id INTO v_inst_paused_id;

  -- Instance 4 : COMPLETED
  INSERT INTO workflow_instances (
    dossier_id, workflow_id, workflow_version, workflow_snapshot,
    current_node_id, context, status,
    triggered_by, started_at, completed_at
  ) VALUES (
    v_dossier2_id,
    v_wf_mise_en_demeure_id, 1, v_def_med,
    'n_fin',
    '{
      "reference":           "DOS-2024-000",
      "client_name":         "Cheikh Ndiaye",
      "client_phone":        "+221789001122",
      "debiteur_nom":        "M. Lamine Koné",
      "debiteur_adresse":    "Pikine Rue 12, Dakar",
      "montant":             350000,
      "motif":               "Loyer impayé",
      "mode_envoi":          "WhatsApp",
      "date_envoi":          "2024-11-15",
      "accuse_reception":    true
    }',
    'COMPLETED',
    'MANUAL',
    now() - INTERVAL '5 days',
    now() - INTERVAL '3 days'
  ) RETURNING id INTO v_inst_completed_id;

  -- Instance 5 : FAILED
  INSERT INTO workflow_instances (
    dossier_id, workflow_id, workflow_version, workflow_snapshot,
    current_node_id, context, status, last_error, retry_count,
    triggered_by, started_at
  ) VALUES (
    gen_random_uuid(),
    v_wf_recouvrement_id, 1, v_def_recouvrement,
    'n_notif_email',
    '{"client_name": "Test Échec", "client_email": "invalid", "montant": 200000}',
    'FAILED',
    'SendEmail failed: Invalid email address "invalid"',
    3,
    'MANUAL',
    now() - INTERVAL '6 hours'
  ) RETURNING id INTO v_inst_failed_id;

  RAISE NOTICE '5 instances créées (WAITING=%, RUNNING=%, PAUSED=%, COMPLETED=%, FAILED=%)',
    v_inst_waiting_id, v_inst_running_id, v_inst_paused_id, v_inst_completed_id, v_inst_failed_id;

  -- ── 5. Logs (workflow_logs) ─────────────────────────────────────────────────

  -- Logs instance WAITING
  INSERT INTO workflow_logs (instance_id, level, event_type, from_node_id, to_node_id, edge_id, message, context_snapshot)
  VALUES
    (v_inst_waiting_id, 'INFO', 'TRIGGER',    null,               'n_intake',          null,                  'Workflow démarré manuellement',                    '{"reference":"DOS-2024-001"}'),
    (v_inst_waiting_id, 'INFO', 'TRANSITION', 'n_intake',         'n_check_montant',   'e_saisie_vers_check', 'Valider le dossier',                               '{"montant":750000}'),
    (v_inst_waiting_id, 'INFO', 'TRANSITION', 'n_check_montant',  'n_notif_email',     'e_montant_ok',        '[AUTO CONDITION] Montant suffisant (≥ 50 000 XOF)', '{"montant":750000}'),
    (v_inst_waiting_id, 'INFO', 'ACTION_EXEC','n_notif_email',     null,                null,                  'Exécution: Notification dossier ouvert',            '{"montant":750000}'),
    (v_inst_waiting_id, 'INFO', 'TRANSITION', 'n_notif_email',    'n_attente_reponse', 'e_notif_vers_attente','En attente',                                       '{"montant":750000}');

  -- Logs instance PAUSED
  INSERT INTO workflow_logs (instance_id, level, event_type, from_node_id, to_node_id, edge_id, message, context_snapshot)
  VALUES
    (v_inst_paused_id, 'INFO', 'TRIGGER',    null,         'n_collect',        null,  'Workflow démarré automatiquement à la création du dossier', '{}'),
    (v_inst_paused_id, 'INFO', 'TRANSITION', 'n_collect',  'n_delai_reflexion','e1',  'Valider',                                                   '{"montant":1200000}'),
    (v_inst_paused_id, 'INFO', 'PAUSE',      null,         null,               null,  'Délai de 48h déclenché — reprise automatique planifiée',    '{"montant":1200000}');

  -- Logs instance COMPLETED
  INSERT INTO workflow_logs (instance_id, level, event_type, from_node_id, to_node_id, edge_id, message, context_snapshot)
  VALUES
    (v_inst_completed_id, 'INFO', 'TRIGGER',    null,             'n_collect',        null, 'Démarrage manuel',                          '{}'),
    (v_inst_completed_id, 'INFO', 'TRANSITION', 'n_collect',      'n_delai_reflexion','e1', 'Valider',                                   '{"montant":350000}'),
    (v_inst_completed_id, 'INFO', 'RESUME',     'n_delai_reflexion','n_redaction',    'e2', 'Délai écoulé — reprise',                    '{"montant":350000}'),
    (v_inst_completed_id, 'INFO', 'TRANSITION', 'n_redaction',    'n_confirmation',   'e3', 'Document prêt',                             '{"montant":350000}'),
    (v_inst_completed_id, 'INFO', 'TRANSITION', 'n_confirmation', 'n_fin',            'e4', 'Envoi confirmé',                            '{"montant":350000,"mode_envoi":"WhatsApp"}');

  -- Logs instance FAILED
  INSERT INTO workflow_logs (instance_id, level, event_type, from_node_id, to_node_id, message, context_snapshot, error_details)
  VALUES
    (v_inst_failed_id, 'INFO',  'TRIGGER',    null,           'n_intake',     'Démarrage',                                        '{}',                    null),
    (v_inst_failed_id, 'INFO',  'TRANSITION', 'n_intake',     'n_notif_email','Valider le dossier',                               '{"client_email":"invalid"}', null),
    (v_inst_failed_id, 'ERROR', 'ERROR',      'n_notif_email', null,          'Job SEND_NOTIFICATION échoué après 3 tentatives',  '{"client_email":"invalid"}',
      '{"error": "SendEmail failed: Invalid email address \"invalid\"", "retry_count": 3}'),
    (v_inst_failed_id, 'WARN',  'ERROR',      null,            null,          'Instance passée en FAILED',                        '{}', null);

  RAISE NOTICE 'Logs insérés';

  -- ── 6. Jobs en queue ────────────────────────────────────────────────────────

  -- Job PENDING pour l''instance en attente (timeout planifié)
  INSERT INTO workflow_jobs (instance_id, job_type, payload, status, priority, process_after)
  VALUES (
    v_inst_waiting_id,
    'RESUME_DELAY',
    json_build_object(
      'node_id',   'n_attente_reponse',
      'next_edge', 'e_timeout',
      'is_timeout', true
    ),
    'PENDING',
    8,
    now() + INTERVAL '70 hours'  -- timeout dans 70h (72h - 2h déjà écoulées)
  );

  -- Job PENDING pour l''instance PAUSED (reprise après délai)
  INSERT INTO workflow_jobs (instance_id, job_type, payload, status, priority, process_after)
  VALUES (
    v_inst_paused_id,
    'RESUME_DELAY',
    json_build_object(
      'node_id',   'n_delai_reflexion',
      'next_edge', 'e2',
      'is_timeout', false
    ),
    'PENDING',
    8,
    now() + INTERVAL '43 hours'
  );

  -- Job DONE pour l''instance COMPLETED (email envoyé)
  INSERT INTO workflow_jobs (instance_id, job_type, payload, status, priority, process_after, processed_at)
  VALUES (
    v_inst_completed_id,
    'SEND_NOTIFICATION',
    '{"channel":"whatsapp","phone":"+221789001122","text":"Votre mise en demeure a bien été préparée."}',
    'DONE',
    2,
    now() - INTERVAL '5 days',
    now() - INTERVAL '5 days'
  );

  -- Job FAILED pour l''instance FAILED
  INSERT INTO workflow_jobs (instance_id, job_type, payload, status, priority, retry_count, max_retries, last_error, process_after)
  VALUES (
    v_inst_failed_id,
    'SEND_NOTIFICATION',
    '{"channel":"email","email":"invalid","subject":"Test","body":"Test"}',
    'FAILED',
    3, 3, 3,
    'SendEmail failed: Invalid email address "invalid"',
    now() - INTERVAL '5 hours'
  );

  RAISE NOTICE 'Jobs insérés';

  -- ── 7. Token de tracking client ─────────────────────────────────────────────
  DELETE FROM client_tracking_tokens WHERE dossier_id = v_dossier_id;

  INSERT INTO client_tracking_tokens (token, dossier_id, instance_id, client_phone, client_email, expires_at, view_count)
  VALUES (
    'seed_token_amadou_diallo_test_abc123',
    v_dossier_id,
    v_inst_waiting_id,
    '+221771234567',
    'amadou.diallo@example.com',
    now() + INTERVAL '30 days',
    2
  );

  RAISE NOTICE 'Token de tracking inséré';

  -- ── 8. Récapitulatif ────────────────────────────────────────────────────────
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE 'SEED TERMINÉ avec succès';
  RAISE NOTICE '  Business    : %', v_business_id;
  RAISE NOTICE '  Workflow 1  : % (Recouvrement)', v_wf_recouvrement_id;
  RAISE NOTICE '  Workflow 2  : % (Mise en demeure)', v_wf_mise_en_demeure_id;
  RAISE NOTICE '  Instances   : 5 (WAITING / RUNNING / PAUSED / COMPLETED / FAILED)';
  RAISE NOTICE '  Prétentions : 4';
  RAISE NOTICE '  Jobs queue  : 4 (1 PENDING×2, 1 DONE, 1 FAILED)';
  RAISE NOTICE '  Dossier test: % et %', v_dossier_id, v_dossier2_id;
  RAISE NOTICE '══════════════════════════════════════════════';

END $$;
