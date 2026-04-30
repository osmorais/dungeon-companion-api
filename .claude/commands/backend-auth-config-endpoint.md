
### Resumo
Além do sistema de login, configure o componente `@loopback/authentication` no backend. Crie uma `JWTStrategy` que valide o header `Authorization: Bearer <token>` usando o `AuthService`. Aplique o decorator `@authenticate('jwt')` nos endpoints que precisam de proteção e mostre como injetar o `SecurityBindings.USER` para identificar o usuário logado.

---
Para validar o token JWT em todos os endpoints protegidos no **LoopBack 4**, a forma correta e mais comum é utilizar o pacote oficial `@loopback/authentication` e criar uma **Authentication Strategy** customizada.

Aqui estão as instruções complementares para o **Backend** que você deve passar para o Claude Code:

---

### Adendo ao `backend-implementation.md`: Proteção de Rotas com JWT

Este guia configura o LoopBack 4 para interceptar o header `Authorization: Bearer <token>`, validar o JWT e permitir/bloquear o acesso.

#### 1. Instalação de Dependências
Certifique-se de que os pacotes de autenticação do LoopBack estão instalados:
```bash
npm install @loopback/authentication @loopback/security
```

#### 2. Atualizar o `AuthService`
Adicione o método de verificação ao serviço que criamos anteriormente:

```typescript
// No AuthService
async verifyToken(token: string): Promise<any> {
  try {
    // Retorna o payload do usuário (id, email) se for válido
    return jwt.verify(token, 'SEU_SECRET_AQUI');
  } catch (error) {
    throw new HttpErrors.Unauthorized('Token inválido ou expirado');
  }
}
```

#### 3. Criar a Estratégia de Autenticação (`strategies/jwt.strategy.ts`)
Essa classe é responsável por extrair o token do header e usar o `AuthService` para validar.

- **Nome da Estratégia:** `jwt`
- **Lógica:**
    1. Captura o header `Authorization`.
    2. Verifica se começa com `Bearer `.
    3. Chama `authService.verifyToken(token)`.
    4. Se válido, retorna um objeto `UserProfile` (padrão do LoopBack).

#### 4. Registrar no `application.ts`
No arquivo principal da aplicação, você deve registrar o componente de autenticação e a estratégia:

```typescript
import {AuthenticationComponent, registerAuthenticationStrategy} from '@loopback/authentication';
import {JWTStrategy} from './strategies/jwt.strategy';

// No construtor da classe App:
this.component(AuthenticationComponent);
registerAuthenticationStrategy(this, JWTStrategy);
```

#### 5. Proteger os Endpoints nos Controllers
Agora, para validar qualquer endpoint (novo ou já existente), basta usar o decorator `@authenticate`:

```typescript
import {authenticate} from '@loopback/authentication';

export class ProductController {
  
  @authenticate('jwt') // <--- Isso protege TODAS as rotas deste controller
  @get('/products')
  async find() {
    return this.productRepository.find();
  }

  @authenticate.skip() // <--- Se quiser deixar uma rota específica pública
  @get('/products/public')
  async findPublic() { ... }
}
```

#### 6. Acessar os dados do usuário logado
Caso você precise do ID do usuário que enviou o token dentro de um método do Controller:

```typescript
import {inject} from '@loopback/core';
import {SecurityBindings, UserProfile} from '@loopback/security';

// Dentro do método do Controller:
constructor(
  @inject(SecurityBindings.USER, {optional: true}) public user: UserProfile,
) {}

@post('/my-profile')
@authenticate('jwt')
async getProfile() {
  const userId = this.user.id; // ID extraído do Token automaticamente
  return this.userRepository.findById(userId);
}
```

---
