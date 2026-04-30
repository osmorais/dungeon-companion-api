Implemente a estrutura de autenticação no backend seguindo estas instruções:

# Instruções de Implementação: Backend (LoopBack 4 + PostgreSQL)

Implementar o sistema de autenticação seguindo a arquitetura de camadas do LoopBack 4.

## 0. IMPORTANTE
    - Garanta que os pacotes necessários para a implementação descrita nesse documento estão instalados.

## 1. Banco de Dados (PostgreSQL)
- A tabela `users` foi criada no banco de dados conforme as colunas abaixo:
    - `id`: UUID (Primary Key, default gen_random_uuid())
    - `email`: VARCHAR(255), Unique, Not Null
    - `password_hash`: TEXT, Not Null
    - `full_name`: VARCHAR(255)
    - `reset_token`: TEXT (Nullable)
    - `reset_token_expires`: TIMESTAMP (Nullable)
    - `created_at`: TIMESTAMP, Default NOW()

## 2. Model e Repository
- **Model (`user.model.ts`):** 
    - Definir propriedades conforme tabela do banco.
    - Utilizar `{hidden: true}` no decorador `@property` para `password_hash`, `reset_token` e `reset_token_expires`.
- **Repository (`user.repository.ts`):** Criar repositório padrão injetando o DataSource do Postgres. Pode usar a skill /create-repository.md passando os dados solicitados pela skill.

## 3. Serviços (`/services`)
- **AuthService:**
    - Criar métodos utilizando `bcryptjs` para `hashPassword` e `comparePassword`.
    - Criar método `generateToken(user)` utilizando `jsonwebtoken` para assinar o JWT (expiração de 8h).
- **EmailService:**
    - Implementar envio de e-mail (pode ser um log no console para dev ou `nodemailer`) para o fluxo de recuperação de senha.

## 4. Controller (`auth.controller.ts`)
Implementar os seguintes endpoints REST:

1. **POST `/auth/signup`**: 
   - Validar se e-mail já existe.
   - Gerar hash da senha.
   - Salvar usuário no banco.
2. **POST `/auth/login`**:
   - Buscar usuário por e-mail.
   - Validar senha com bcrypt.
   - Retornar `{ token, user: { id, email, full_name } }`.
3. **POST `/auth/forgot-password`**:
   - Receber `{ email }`.
   - Gerar token aleatório (ex: `crypto.randomBytes(32)`).
   - Salvar token e expiração (Date.now() + 3600000) no registro do usuário.
   - Disparar e-mail com link: `http://frontend/reset-password?token=XYZ`.
4. **POST `/auth/reset-password`**:
   - Receber `{ token, newPassword }`.
   - Validar se o token existe e se `reset_token_expires > NOW()`.
   - Atualizar `password_hash`, limpar `reset_token` e `reset_token_expires`.

## 5. Segurança
- Configurar variáveis de ambiente para `JWT_SECRET`.
- Garantir tratamento de erros apropriado com `HttpErrors`.

## 6. Pós implementação endpoints de login
- Execute as instruções informadas em ./backend-auth-config-endpoint.md

