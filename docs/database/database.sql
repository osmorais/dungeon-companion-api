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