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

-- Atributos (FOR/DES/CON/INT/SAB/CAR). id fixo de 1 a 6, sem SERIAL — o seed informa o id.
CREATE TABLE Attribute_Type (
    id_attribute INT PRIMARY KEY,
    name VARCHAR(3) NOT NULL,
    full_name VARCHAR(20) NOT NULL,
    description TEXT
);

-- Perícias, cada uma ligada ao atributo que usa.
CREATE TABLE Skill (
    id_skill SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    id_attribute INT,
    description TEXT,
    CONSTRAINT fk_attribute FOREIGN KEY (id_attribute) REFERENCES Attribute_Type(id_attribute)
);

CREATE TABLE Spell (
    id_spell SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    casting_time VARCHAR(255),
    range_distance INT,
    duration VARCHAR(255),
    damage VARCHAR(50),   -- notação de dado, ex: '1d10'
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
    total_po FLOAT DEFAULT 0,   -- fracionado: itens custam 0,05 PO, 0,2 PO etc.
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
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    reset_token TEXT,
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE "character"
ADD COLUMN IF NOT EXISTS user_id UUID
    CONSTRAINT fk_character_user REFERENCES users(id) ON DELETE CASCADE;

-- ====================================================================================
-- GOOGLE OAUTH
-- ====================================================================================

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Nome de usuário (1.9.0): aparece pra mesa (mestre e jogador) e no ranking, no lugar do
-- dm_name/player_name digitados. Único sem diferenciar maiúsculas (índice em LOWER). Nulo em conta
-- antiga ou criada com o Google até a pessoa escolher (o web pede no próximo acesso).
-- Regras de formato em src/services/username.ts. full_name deixou de ser coletado e foi apagado
-- em produção em 2026-10-24 (coluna mantida, sempre nula).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (LOWER(username));
-- ====================================================================================
-- AVATAR PRESET
-- ====================================================================================

ALTER TABLE "character"
ADD COLUMN IF NOT EXISTS avatar_preset JSONB;

-- ==========================================
-- GAME SESSION
-- ==========================================

CREATE TABLE IF NOT EXISTS game_session (
    id_game_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR(255) NOT NULL,
    session_code VARCHAR(50) NOT NULL UNIQUE,
    max_player_quantity INTEGER NOT NULL,
    dm_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "game_session"
ADD COLUMN IF NOT EXISTS user_id UUID
    CONSTRAINT fk_game_session_user REFERENCES users(id) ON DELETE CASCADE;


-- ==========================================
-- PLAYER SESSION
-- ==========================================

CREATE TABLE IF NOT EXISTS player_session (
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
ADD COLUMN IF NOT EXISTS user_id UUID
    CONSTRAINT fk_player_session_user REFERENCES users(id) ON DELETE CASCADE;


-- ==========================================
-- NPC SESSION
-- ==========================================

CREATE TABLE IF NOT EXISTS npc_session (
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

CREATE TABLE IF NOT EXISTS monster_session (
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

CREATE TABLE IF NOT EXISTS session_roll_log (
    id_roll UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL,
    id_character INT REFERENCES Character(id_character) ON DELETE SET NULL,

    actor_name VARCHAR(255) NOT NULL,
    roll_type VARCHAR(20) NOT NULL,       -- 'dice' | 'attack' | 'damage' | 'skill' | 'save' | 'spell' | 'initiative' | 'heal'
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

CREATE TABLE IF NOT EXISTS combat_encounter (
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

CREATE TABLE IF NOT EXISTS combat_participant (
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

CREATE INDEX IF NOT EXISTS idx_player_session_game
    ON player_session(id_game_session);

CREATE INDEX IF NOT EXISTS idx_player_session_character
    ON player_session(id_character);

CREATE INDEX IF NOT EXISTS idx_session_roll_log_session_created
    ON session_roll_log(id_game_session, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_npc_session_game
    ON npc_session(id_game_session);

CREATE INDEX IF NOT EXISTS idx_npc_session_character
    ON npc_session(id_character);

CREATE INDEX IF NOT EXISTS idx_monster_session_game
    ON monster_session(id_game_session);

CREATE INDEX IF NOT EXISTS idx_combat_encounter_game_session
    ON combat_encounter(id_game_session);

CREATE INDEX IF NOT EXISTS idx_combat_participant_encounter
    ON combat_participant(id_combat_encounter);

CREATE INDEX IF NOT EXISTS idx_monster_snapshot_gin
    ON monster_session
    USING GIN (data_snapshot);

-- ==========================================
-- SUBRACE
-- ==========================================

ALTER TABLE character ADD COLUMN IF NOT EXISTS subrace VARCHAR(100);

-- ==========================================
-- MONSTER CATALOG (bestiário do mestre, cadastrado a partir do SRD de D&D 5e)
-- ==========================================

CREATE TABLE IF NOT EXISTS monster_catalog (
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

CREATE INDEX IF NOT EXISTS idx_monster_catalog_user
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

-- Efeitos ativos guardados no personagem (Fúria, Arma Sagrada) e somas 1×/turno já usadas na vez
-- atual do combate (Ataque Furtivo, Golpe Divino, Matador de Inimigos) — ver combat-features.ts.
-- Zera no descanso longo e no fim do combate.
ALTER TABLE character ADD COLUMN IF NOT EXISTS active_effects JSONB NULL;

-- ==========================================
-- BÔNUS/ESCOLHAS DE RAÇA E CLASSE PENDENTES (auditoria 2026-09-11)
-- ==========================================

-- Escolha de ferramenta de artesão do Anão (ferreiro/cervejeiro/pedreiro) — texto livre, sem
-- FK, mesmo padrão de id_subclass (catálogo hardcoded em rules.ts, não em tabela própria).
ALTER TABLE character ADD COLUMN IF NOT EXISTS chosen_tool_proficiency VARCHAR(100);

-- Estilo de Combate do Guerreiro (Arqueria/Defesa/Duelo/Grande Arma/Proteção/Combate com Duas
-- Armas) — Defesa/Arqueria/Duelo têm efeito mecânico real (CA/ataque/dano); os outros três
-- ficam só de exibição (exigiriam rerolagem de dado ou reação, fora do escopo atual).
ALTER TABLE character ADD COLUMN IF NOT EXISTS chosen_fighting_style VARCHAR(50);

-- ==========================================
-- REORDENAR INICIATIVA / ATRASAR TURNO / VIDA TEMPORÁRIA (2026-09-18)
-- ==========================================

-- Ordem de turno deixa de ser 100% derivada de initiative_total (recalculada a cada leitura) e
-- passa a ser persistida — atribuída quando o combate fica ativo (mesmo critério de desempate de
-- antes: initiative_total > dex_modifier > id) e livremente editável pelo mestre depois disso.
-- Nulo enquanto o combate ainda está na fase de rolagem de iniciativa.
ALTER TABLE combat_participant ADD COLUMN IF NOT EXISTS turn_order INTEGER;

-- true quando o participante atrasou o próprio turno nesta rodada (passa a agir por último,
-- mantendo turn_order normal a partir da rodada seguinte). Limpo automaticamente sempre que a
-- rodada avança (CombatRepository.clearDelayedFlags).
ALTER TABLE combat_participant ADD COLUMN IF NOT EXISTS delayed_this_round BOOLEAN NOT NULL DEFAULT false;

-- Substitui current_turn_index (índice posicional, frágil a reordenação/atraso) por uma
-- referência estável ao participante da vez — reordenar ou atrasar nunca "pula" o turno pra
-- outro participante por engano. A coluna current_turn_index antiga fica sem uso (não removida,
-- só deixou de ser lida/escrita pelo código).
ALTER TABLE combat_encounter ADD COLUMN IF NOT EXISTS current_turn_participant_id UUID
    REFERENCES combat_participant(id_combat_participant)
    ON DELETE SET NULL;

-- Vida temporária (regra do livro: amortecedor de dano à parte do PV normal, pode deixar o total
-- acima do máximo, nunca acumula com uma vida temporária existente, cura nunca a restaura).
ALTER TABLE character ADD COLUMN IF NOT EXISTS temporary_hit_points INTEGER NOT NULL DEFAULT 0;

-- ==========================================
-- IMAGEM DE FUNDO DO JOGADOR NA SESSÃO (2026-09-19)
-- ==========================================

-- Foto de verdade (via Supabase Storage, mesmo bucket dos monstros) — à parte do avatar_preset
-- (ícone de estoque). Botão "UPLOAD IMAGEM" no cabeçalho da ficha; usada como fundo escurecido
-- do toast de rolagem na sessão (session-panel), tanto pra jogador quanto pra NPC (mesma coluna,
-- personagem compartilhado).
ALTER TABLE character ADD COLUMN IF NOT EXISTS image_url TEXT;
-- ====================================================================================
-- MIGRAÇÕES JÁ APLICADAS EM PRODUÇÃO QUE NÃO ESTAVAM REGISTRADAS AQUI (conferido em 2026-10-15
-- contra o information_schema do banco real). Em ordem cronológica.
-- ====================================================================================

-- ==========================================
-- ARMA DO PERSONAGEM (2026-06-04)
-- ==========================================

-- Coluna legada: existe no banco, mas o código não grava nem lê. O bônus de ataque da arma é
-- calculado ao carregar a ficha (calculator.ts, buildWeaponActions).
ALTER TABLE character_weapon ADD COLUMN IF NOT EXISTS attack_bonus INT;

-- ==========================================
-- ROLAGEM OCULTA DO MESTRE (2026-09-09)
-- ==========================================

-- Rolagem que só o mestre vê. O evento roll_added fica DM-only e a leitura da sessão filtra essas
-- linhas pra jogador. Só o mestre consegue gravar true (o campo é ignorado quando vem de jogador).
ALTER TABLE session_roll_log ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- ==========================================
-- IMAGEM DE MONSTRO (2026-09-09)
-- ==========================================

-- URL pública no Supabase Storage. O monstro adicionado à sessão herda a imagem do catálogo, e o
-- mestre pode trocar só a da sessão depois. A mesma URL pode estar nas duas tabelas (e em
-- character.image_url), por isso a limpeza do storage só apaga arquivo que ninguém referencia
-- (ImageReferenceRepository / ImageCleanupService).
ALTER TABLE monster_catalog ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE monster_session ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ==========================================
-- ESCOLHAS GENÉRICAS NO LEVEL-UP E DÁDIVA DO PACTO (2026-09-12)
-- ==========================================

-- Payload livre da escolha feita num level-up (talentos com escolha própria, etc.). Recebido em
-- LevelUpConfirmInput.choice_data e lido por CharacterRepository.findChoiceData.
ALTER TABLE character_level_history ADD COLUMN IF NOT EXISTS choice_data JSONB;

-- Dádiva do Pacto do Bruxo (Corrente/Lâmina/Grimório). Coluna preparada, ainda sem
-- funcionalidade que grave nela.
ALTER TABLE character ADD COLUMN IF NOT EXISTS chosen_pact_boon TEXT;

-- ==========================================
-- INVENTÁRIO DO JOGADOR NA SESSÃO (2026-09-26)
-- ==========================================

-- Itens que cada jogador tem numa sessão (adicionados pelo mercado, com ou sem débito de PO). Nome,
-- descrição, preço e peso são copiados do item no momento da inclusão. Um registro por item por
-- jogador; repetir o item soma em quantity. Vai embora junto com a participação na sessão
-- (e, por cascata, com a sessão e com a conta).
CREATE TABLE IF NOT EXISTS player_inventory_item (
    id_inventory_item UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_player_session UUID NOT NULL REFERENCES player_session(id_player_session) ON DELETE CASCADE,
    id_item INT NOT NULL REFERENCES item(id_item),

    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_value FLOAT,
    weight FLOAT,
    quantity INT NOT NULL DEFAULT 1,

    UNIQUE (id_player_session, id_item)
);

-- ==========================================
-- AJUSTES DE TIPO (2026-09-26)
-- ==========================================

-- Pra bancos criados com a versão antiga deste script (no CREATE TABLE acima já estão certos).
-- total_po passou a aceitar fração quando o mercado começou a debitar o preço dos itens.
ALTER TABLE character ALTER COLUMN total_po TYPE FLOAT;
-- damage sempre recebeu notação de dado ('1d10'), nunca número.
ALTER TABLE spell ALTER COLUMN damage TYPE VARCHAR(50);

-- ==========================================
-- IMAGENS DE REFERÊNCIA DA SESSÃO (2026-10-17)
-- ==========================================

-- Biblioteca de imagens que o mestre sobe numa sessão (mapa, cena, NPC...) pra mostrar em tela
-- cheia pros jogadores (GameSessionService.showReferenceImage). Só o mestre vê a lista; os
-- jogadores só recebem a imagem que estiver em exibição. Vai embora junto com a sessão (e, por
-- cascata, com a conta do mestre); o arquivo no storage é limpo pelo ImageCleanupService.
CREATE TABLE IF NOT EXISTS session_reference_image (
    id_reference_image UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_game_session UUID NOT NULL REFERENCES game_session(id_game_session) ON DELETE CASCADE,

    image_url TEXT NOT NULL,
    -- Legenda opcional mostrada junto com a imagem (texto livre do mestre, até 120 caracteres).
    title VARCHAR(120),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_reference_image_session
    ON session_reference_image(id_game_session);

-- Imagem de referência em exibição agora (NULL = nenhuma). Quem entra ou recarrega a sessão
-- recebe a imagem por GameSessionDetail.shown_reference_image.
ALTER TABLE game_session
  ADD COLUMN IF NOT EXISTS shown_reference_image_id UUID
    REFERENCES session_reference_image(id_reference_image) ON DELETE SET NULL;

-- Anotações privadas do mestre na sessão (Quadro do Mestre). Só o dono da sessão lê e grava
-- (GET/PUT /api/game-session/{id}/dm-notes) — nunca vai no detalhe da sessão que os jogadores
-- recebem. Até 10.000 caracteres (validado no GameSessionService). Sai na exportação da conta e
-- vai embora junto com a sessão.
ALTER TABLE game_session
  ADD COLUMN IF NOT EXISTS dm_notes TEXT;

-- ==========================================
-- RANKING (1.7.0)
-- ==========================================

-- Estatísticas do ranking global por personagem e sessão, somadas enquanto a mesa joga
-- (GameSessionService.recordStats -> GameSessionRepository.bumpStats; regras em
-- services/ranking-stats.ts). Só personagem de jogador da sessão entra. Lido por
-- RankingRepository (GET /api/ranking). Vai embora com a sessão e com o personagem (e, por
-- cascata, com a conta); sai na exportação da conta.
CREATE TABLE IF NOT EXISTS character_session_stats (
    id_game_session UUID NOT NULL REFERENCES game_session(id_game_session) ON DELETE CASCADE,
    id_character INT NOT NULL REFERENCES Character(id_character) ON DELETE CASCADE,

    damage_dealt INT NOT NULL DEFAULT 0,      -- dano rolado (conta na rolagem, aplicado ou não)
    damage_taken INT NOT NULL DEFAULT 0,      -- PV perdidos (aplicado ou editado à mão)
    healing_done INT NOT NULL DEFAULT 0,      -- cura rolada (conta na rolagem)
    biggest_hit INT NOT NULL DEFAULT 0,       -- maior rolagem de dano (guarda o máximo)
    monsters_defeated INT NOT NULL DEFAULT 0, -- golpe final em monstro (dano aplicado que zerou)
    knockouts INT NOT NULL DEFAULT 0,         -- vezes que caiu a 0 PV
    nat20 INT NOT NULL DEFAULT 0,
    nat1 INT NOT NULL DEFAULT 0,
    d20_count INT NOT NULL DEFAULT 0,         -- d20 puros rolados (média = d20_sum / d20_count)
    d20_sum INT NOT NULL DEFAULT 0,
    rolls_count INT NOT NULL DEFAULT 0,
    spells_cast INT NOT NULL DEFAULT 0,
    xp_gained INT NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_game_session, id_character)
);

CREATE INDEX IF NOT EXISTS idx_character_session_stats_character
    ON character_session_stats(id_character);

-- O usuário pode sair do ranking global na página /conta (padrão: aparece).
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_in_ranking BOOLEAN NOT NULL DEFAULT TRUE;

-- ==========================================
-- MONSTER (bestiário de referência: as 428 fichas do Manual dos Monstros em português)
-- ==========================================
-- Dado de fábrica, igual pra todos os mestres (seed em database_inserts.sql). Vai substituir a
-- consulta à dnd5eapi (SrdMonsterService) como fonte da lista de monstros pra catalogar.
-- `data` segue as chaves da dnd5eapi (armor_class, hit_points, actions…), que o site já lê, com os
-- valores em português; ataques, dano, CD e usos vêm estruturados em cada habilidade.
CREATE TABLE IF NOT EXISTS monster (
    id_monster SERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,      -- = data.index
    name VARCHAR(150) NOT NULL,
    challenge_rating NUMERIC(6,3) NOT NULL, -- 0, 0.125, 0.25, 0.5, 1..30
    hp_max INTEGER NOT NULL,
    ac INTEGER NOT NULL,
    data JSONB NOT NULL
);

-- Usos das ações do monstro na mesa (1.11.0): recargas gastas, usos por dia/descanso, ações
-- lendárias e reação gastas desde o turno dele, e se está no covil. Formato e regras em
-- src/services/monster-action-state.ts; o início do turno do monstro (combate) rola as recargas.
ALTER TABLE monster_session ADD COLUMN IF NOT EXISTS action_state JSONB;

-- Descrição (lore) de cada monstro do bestiário (1.11.0): aparece na carta do aviso de
-- monstro revelado, pra mesa inteira. Texto próprio, inspirado no livro. Achada pelo slug
-- (monster_session.monster_api_slug), então vale também pra monstros que já estavam nas mesas.
ALTER TABLE monster ADD COLUMN IF NOT EXISTS lore TEXT;
