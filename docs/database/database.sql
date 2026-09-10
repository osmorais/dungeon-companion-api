-- Criar tabela de Atributos
CREATE TABLE Attribute_Type (
    id_attribute INT PRIMARY KEY,
    name VARCHAR(3) NOT NULL,
    full_name VARCHAR(20) NOT NULL,
    description TEXT
);

-- Criar tabela de Perícias (Skills)
CREATE TABLE Skill (
    id_skill SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    id_attribute INT,
    description TEXT,
    CONSTRAINT fk_attribute FOREIGN KEY (id_attribute) REFERENCES Attribute_Type(id_attribute)
);

-- ====================================================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS D&D 5E - POSTGRESQL
-- ====================================================================================


-- Limpeza prévia (Opcional - Remove as tabelas se elas já existirem)
DROP TABLE IF EXISTS Character_Items CASCADE;
DROP TABLE IF EXISTS Character_Weapon CASCADE;
DROP TABLE IF EXISTS Character_Spell CASCADE;
DROP TABLE IF EXISTS Character_Attribute CASCADE;
DROP TABLE IF EXISTS Character_Skill CASCADE;
DROP TABLE IF EXISTS Character_Background CASCADE;
DROP TABLE IF EXISTS Character CASCADE;
DROP TABLE IF EXISTS Item CASCADE;
DROP TABLE IF EXISTS Weapon CASCADE;
DROP TABLE IF EXISTS Spell CASCADE;
DROP TABLE IF EXISTS Attribute_Type CASCADE;
DROP TABLE IF EXISTS Skill CASCADE;
DROP TABLE IF EXISTS Armour CASCADE;
DROP TABLE IF EXISTS Background CASCADE;
DROP TABLE IF EXISTS Class CASCADE;
DROP TABLE IF EXISTS Race CASCADE;
DROP TABLE IF EXISTS Alignment CASCADE;

-- ====================================================================================
-- 1. TABELAS INDEPENDENTES (DOMÍNIOS / LOOKUPS)
-- ====================================================================================

CREATE TABLE Alignment (
    id_alignment SERIAL PRIMARY KEY,
    name VARCHAR(50),
    description VARCHAR(255) NOT NULL
);

CREATE TABLE Race (
    id_race SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    movement VARCHAR(50)
);

CREATE TABLE Class (
    id_class SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    starting_gold_po INT
);

CREATE TABLE Background (
    id_background SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    starting_gold_po INT,
    languages_number INT
);

CREATE TABLE Armour (
    id_armour SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    armour_class_base INT,
    is_sum_dexterity BOOLEAN,
    armour_type VARCHAR(50),
    max_dexterity_bonus INT,
    is_stealth_disadvantage BOOLEAN,
    weight FLOAT,
    price_value FLOAT
);

CREATE TABLE Skill (
    id_skill SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE Attribute_Type (
    id_attribute_type SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    full_name VARCHAR(50),
    description TEXT
);

CREATE TABLE Spell (
    id_spell SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    casting_time VARCHAR(255),
    range_distance INT,
    duration VARCHAR(255),
    damage INT,
    is_verbal BOOLEAN,
    is_somatic BOOLEAN,
    is_material BOOLEAN,
    spellLevel INT,
    school VARCHAR(255)
);

CREATE TABLE Weapon (
    id_weapon SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    damage_die VARCHAR(50),
    damage_type VARCHAR(50),
    properties TEXT,
    weight FLOAT,
    price_value FLOAT
);

CREATE TABLE Item (
    id_item SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_value FLOAT,
    weight FLOAT
);


-- ====================================================================================
-- 2. TABELA PRINCIPAL (ENTIDADE CENTRAL)
-- ====================================================================================

CREATE TABLE Character (
    id_character SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    player_name VARCHAR(255),
    xp_points INT DEFAULT 0,
    proficiency_bonus INT DEFAULT 2,
    level INT DEFAULT 1,
    initiative_value INT,
    armour_class INT,
    current_hit_points INT,
    max_hit_points INT,
    hit_dice VARCHAR(50),
    passive_perception VARCHAR(50),
    inspiration INT DEFAULT 0,
    total_po INT DEFAULT 0,
    weight FLOAT,
    height FLOAT,
    others_characteristics TEXT,
    
    -- Chaves Estrangeiras indicadas nos quadros azuis
    id_race INT REFERENCES Race(id_race),
    id_class INT REFERENCES Class(id_class),
    id_armour INT REFERENCES Armour(id_armour),
    id_alignment INT REFERENCES Alignment(id_alignment)
);


-- ====================================================================================
-- 3. TABELAS ASSOCIATIVAS (RELACIONAMENTOS N:M COM O PERSONAGEM)
-- ====================================================================================

CREATE TABLE Character_Background (
    id_character_background SERIAL PRIMARY KEY,
    full_history TEXT,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_background INT REFERENCES Background(id_background)
);

CREATE TABLE Character_Skill (
    id_character_skill SERIAL PRIMARY KEY,
    is_trained BOOLEAN DEFAULT FALSE,
    trained_value INT DEFAULT 0,
    level_value INT DEFAULT 0,
    total_skill_value INT DEFAULT 0,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_skill INT REFERENCES Skill(id_skill)
);

CREATE TABLE Character_Attribute (
    id_character_attribute SERIAL PRIMARY KEY,
    bonus_value INT DEFAULT 0,
    modifier_value INT DEFAULT 0,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_attribute INT REFERENCES Attribute_Type(id_attribute)
);

CREATE TABLE Character_Spell (
    id_character_spell SERIAL PRIMARY KEY,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_attribute INT REFERENCES Attribute_Type(id_attribute),
    id_spell INT REFERENCES Spell(id_spell)
);

CREATE TABLE Character_Weapon (
    id_character_weapon SERIAL PRIMARY KEY,
    has_proficiency BOOLEAN DEFAULT FALSE,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_weapon INT REFERENCES Weapon(id_weapon)
);

CREATE TABLE Character_Items (
    id_character_item SERIAL PRIMARY KEY,
    
    -- Chaves Estrangeiras
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,
    id_item INT REFERENCES Item(id_item)
);

-- ====================================================================================
-- MIGRAÇÕES
-- ====================================================================================

ALTER TABLE Character
  ADD COLUMN IF NOT EXISTS spellcasting_ability VARCHAR(3),
  ADD COLUMN IF NOT EXISTS spell_save_dc INT,
  ADD COLUMN IF NOT EXISTS spell_attack_bonus INT;

-- Espaços de magia gastos hoje, por nível (ex: {"level_1": 1, "level_2": 0}). Zerado num descanso longo.
ALTER TABLE Character
  ADD COLUMN IF NOT EXISTS spell_slots_expended JSONB NOT NULL DEFAULT '{}';

-- Marca quais magias conhecidas estão preparadas no dia (só relevante pra classes que preparam magia).
ALTER TABLE Character_Spell
  ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN NOT NULL DEFAULT FALSE;

-- Dados de Vida já gastos num descanso curto (total disponível = nível do personagem).
-- Um descanso longo recupera metade do total (mínimo 1); nunca reseta a 0 direto.
ALTER TABLE Character
  ADD COLUMN IF NOT EXISTS hit_dice_spent INT NOT NULL DEFAULT 0;

-- ====================================================================================
-- USUARIO
-- ====================================================================================

-- Habilita a extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Criação da tabela
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    reset_token TEXT,
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE "character"
ADD COLUMN user_id UUID;

ALTER TABLE "character"
ADD CONSTRAINT fk_character_user
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;

-- ====================================================================================
-- GOOGLE OAUTH
-- ====================================================================================

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
-- ====================================================================================
-- AVATAR PRESET
-- ====================================================================================

ALTER TABLE "character"
ADD COLUMN IF NOT EXISTS avatar_preset JSONB;

-- ==========================================
-- GAME SESSION
-- ==========================================

CREATE TABLE game_session (
    id_game_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR(255) NOT NULL,
    session_code VARCHAR(50) NOT NULL UNIQUE,
    max_player_quantity INTEGER NOT NULL,
    dm_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "game_session"
ADD COLUMN user_id UUID;

ALTER TABLE "game_session"
ADD CONSTRAINT fk_game_session_user
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;


-- ==========================================
-- PLAYER SESSION
-- ==========================================

CREATE TABLE player_session (
    id_player_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,

    player_name VARCHAR(255) NOT NULL,

    CONSTRAINT fk_player_session_game_session
        FOREIGN KEY (id_game_session)
        REFERENCES game_session(id_game_session)
        ON DELETE CASCADE
);

ALTER TABLE "player_session"
ADD COLUMN user_id UUID;

ALTER TABLE "player_session"
ADD CONSTRAINT fk_player_session_user
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;


-- ==========================================
-- NPC SESSION
-- ==========================================

CREATE TABLE npc_session (
    id_npc_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,
    id_character INT REFERENCES Character(id_character) ON DELETE CASCADE,

    CONSTRAINT fk_npc_session_game_session
        FOREIGN KEY (id_game_session)
        REFERENCES game_session(id_game_session)
        ON DELETE CASCADE
);

-- ==========================================
-- MONSTER SESSION
-- ==========================================

CREATE TABLE monster_session (
    id_monster_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,

    monster_api_slug VARCHAR(255) NOT NULL,
    custom_name VARCHAR(255),

    hp_current INTEGER NOT NULL,
    hp_max INTEGER NOT NULL,
    ac INTEGER NOT NULL,

    data_snapshot JSONB NOT NULL,

    CONSTRAINT fk_monster_session_game_session
        FOREIGN KEY (id_game_session)
        REFERENCES game_session(id_game_session)
        ON DELETE CASCADE
);

-- ==========================================
-- SESSION ROLL LOG
-- ==========================================

CREATE TABLE session_roll_log (
    id_roll UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,
    id_character INT REFERENCES Character(id_character) ON DELETE SET NULL,

    actor_name VARCHAR(255) NOT NULL,
    roll_type VARCHAR(20) NOT NULL,       -- 'dice' | 'attack' | 'skill' | 'save' | 'spell'
    label VARCHAR(255) NOT NULL,
    dice_notation VARCHAR(20) NOT NULL,   -- ex: '1d20'
    rolls INTEGER[] NOT NULL,             -- resultados brutos (2 valores se vantagem/desvantagem)
    advantage_state VARCHAR(12) NOT NULL DEFAULT 'normal', -- 'normal' | 'advantage' | 'disadvantage'
    modifier INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_roll_log_game_session
        FOREIGN KEY (id_game_session)
        REFERENCES game_session(id_game_session)
        ON DELETE CASCADE
);

-- ==========================================
-- COMBAT ENCOUNTER (iniciativa e ordem de turnos)
-- ==========================================

CREATE TABLE combat_encounter (
    id_combat_encounter UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'rolling_initiative', -- 'rolling_initiative' | 'active' | 'finished'
    round_number INTEGER NOT NULL DEFAULT 1,
    current_turn_index INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_combat_encounter_game_session
        FOREIGN KEY (id_game_session)
        REFERENCES game_session(id_game_session)
        ON DELETE CASCADE
);

CREATE TABLE combat_participant (
    id_combat_participant UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_combat_encounter UUID NOT NULL,
    participant_type VARCHAR(10) NOT NULL, -- 'player' | 'npc'
    id_player_session UUID,
    id_npc_session UUID,

    initiative_roll INTEGER,
    initiative_total INTEGER,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_combat_participant_encounter
        FOREIGN KEY (id_combat_encounter)
        REFERENCES combat_encounter(id_combat_encounter)
        ON DELETE CASCADE,
    CONSTRAINT fk_combat_participant_player_session
        FOREIGN KEY (id_player_session)
        REFERENCES player_session(id_player_session)
        ON DELETE CASCADE,
    CONSTRAINT fk_combat_participant_npc_session
        FOREIGN KEY (id_npc_session)
        REFERENCES npc_session(id_npc_session)
        ON DELETE CASCADE
);

-- ==========================================
-- ÍNDICES
-- ==========================================

CREATE INDEX idx_player_session_game
    ON player_session(id_game_session);

CREATE INDEX idx_player_session_character
    ON player_session(id_character);

CREATE INDEX idx_session_roll_log_session_created
    ON session_roll_log(id_game_session, created_at DESC);

CREATE INDEX idx_npc_session_game
    ON npc_session(id_game_session);

CREATE INDEX idx_npc_session_character
    ON npc_session(id_character);

CREATE INDEX idx_monster_session_game
    ON monster_session(id_game_session);

CREATE INDEX idx_combat_encounter_game_session
    ON combat_encounter(id_game_session);

CREATE INDEX idx_combat_participant_encounter
    ON combat_participant(id_combat_encounter);

CREATE INDEX idx_monster_snapshot_gin
    ON monster_session
    USING GIN (data_snapshot);

-- ==========================================
-- SUBRACE
-- ==========================================

ALTER TABLE character ADD COLUMN IF NOT EXISTS subrace VARCHAR(100);

-- ==========================================
-- MONSTER CATALOG (bestiário do mestre, cadastrado a partir do SRD de D&D 5e)
-- ==========================================

CREATE TABLE monster_catalog (
    id_monster_catalog UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,
    monster_api_slug VARCHAR(255) NOT NULL,
    custom_name VARCHAR(255),

    hp_max INTEGER NOT NULL,
    ac INTEGER NOT NULL,

    data_snapshot JSONB NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_monster_catalog_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_monster_catalog_user
    ON monster_catalog(user_id);

-- ==========================================
-- REVELAÇÃO DE MONSTROS E MONSTROS EM COMBATE
-- ==========================================

-- O mestre vê todo monstro adicionado à sessão; jogadores só o veem (nome, sem status/PV)
-- depois que o mestre revela.
ALTER TABLE monster_session ADD COLUMN IF NOT EXISTS is_revealed BOOLEAN NOT NULL DEFAULT false;

-- Permite que um monstro participe do combate como 'monster' (junto de 'player' e 'npc').
ALTER TABLE combat_participant ADD COLUMN IF NOT EXISTS id_monster_session UUID
    REFERENCES monster_session(id_monster_session)
    ON DELETE CASCADE;

-- ==========================================
-- SUBIR DE NÍVEL (LEVEL UP) — Fase 1
-- ==========================================

-- Histórico de cada nível subido por um personagem: guarda a rolagem de HP (dado de vida +
-- modificador de CON no nível), a escolha de ASI (Incremento no Valor de Habilidade) ou feat
-- quando aplicável, e serve de trava (UNIQUE) pra nunca aplicar o mesmo nível duas vezes.
CREATE TABLE IF NOT EXISTS character_level_history (
    id_character_level_history SERIAL PRIMARY KEY,
    id_character INT NOT NULL REFERENCES character(id_character) ON DELETE CASCADE,
    level INT NOT NULL,
    hit_die_roll INT NOT NULL,
    con_modifier_at_level INT NOT NULL,
    hp_gained INT NOT NULL,
    -- 'asi' | 'feat' | NULL (nível sem escolha de ASI/feat)
    asi_type VARCHAR(10),
    -- ex: {"STR": 1, "CON": 1} quando asi_type = 'asi'
    asi_stat_increases JSONB,
    -- id do feat escolhido quando asi_type = 'feat'
    feat_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_character_level UNIQUE (id_character, level)
);

CREATE INDEX IF NOT EXISTS idx_character_level_history_character
    ON character_level_history(id_character);

-- ==========================================
-- EQUIPAMENTO: CA VIVA (deixa de ser congelada na criação)
-- ==========================================

-- `id_armour` já existia (setado só na criação, nunca mais atualizado). `has_shield` nunca foi
-- persistido em lugar nenhum — só usado transiente pro cálculo inicial de CA. Com essa coluna,
-- o personagem pode trocar de armadura/escudo depois da criação (endpoint de equipamento) e a
-- CA passa a ser recalculada a cada carregamento da ficha (loadCharacter), em vez de usar o
-- valor congelado de `armour_class`.
ALTER TABLE Character ADD COLUMN IF NOT EXISTS has_shield BOOLEAN NOT NULL DEFAULT false;

-- ==========================================
-- SUBCLASSE (Fase 2)
-- ==========================================

-- Slug (ex: 'campeao', 'cavaleiro-arcano') — não é FK pra tabela nenhuma, catálogo fica hardcoded
-- em rules.ts (SUBCLASSES), mesmo padrão de classe/raça. NULL até o personagem escolher (nem
-- todo personagem já chegou no nível de escolha).
ALTER TABLE Character ADD COLUMN IF NOT EXISTS id_subclass VARCHAR(100);

-- Registra em qual level-up a subclasse foi escolhida, junto do resto do histórico de nível.
ALTER TABLE character_level_history ADD COLUMN IF NOT EXISTS id_subclass VARCHAR(100);

-- ==========================================
-- EFEITO MECÂNICO AUTOMÁTICO (Fase 3) — Especialização/Aptidão/Bênção do Conhecimento
-- ==========================================

-- Perícia com bônus de proficiência dobrado (Ladino nível 1/6, Bardo nível 3/10, Domínio do
-- Conhecimento do Clérigo no nível 1). `total_skill_value` já vem com o dobro somado no momento
-- em que a escolha é feita (criação ou level-up) — essa coluna só existe pra exibição (estrela/
-- indicador na ficha) e pra impedir escolher a mesma perícia duas vezes num level-up futuro.
ALTER TABLE character_skill ADD COLUMN IF NOT EXISTS is_expert BOOLEAN NOT NULL DEFAULT false;

-- Recurso consumível rastreado (Fúria do Bárbaro, Pontos de Chi do Monge, Canalizar Divindade do
-- Clérigo) — mesmo padrão de `spell_slots_expended` (JSON por chave, pra não precisar de uma
-- coluna nova a cada recurso futuro). Zera no descanso apropriado (curto ou longo, ver
-- `TRACKABLE_RESOURCES` em rules.ts) e no descanso longo sempre (superset do curto).
ALTER TABLE character ADD COLUMN IF NOT EXISTS resource_uses_expended JSONB NOT NULL DEFAULT '{}';