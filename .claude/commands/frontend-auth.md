Implemente a autenticação completa no frontend Angular seguindo estas instruções:

# Instruções de Implementação: Frontend (Angular + HttpOnly Cookie)

O backend usa **JWT via HttpOnly Cookie** (nunca LocalStorage). O Angular deve enviar `withCredentials: true` em toda requisição à API para que o browser inclua o cookie automaticamente.

---

## 0. IMPORTANTE — Premissas

- Angular 19+, standalone components, signals (`signal`, `computed`)
- `HttpClient` funcional (já configurado em `app.config.ts`)
- Font: `'Press Start 2P'` — manter visual 8-bit RPG presente em todo o projeto
- Variáveis CSS já definidas em `styles.scss`: `--bg-color`, `--panel-bg`, `--text-color`, `--accent-color`, `--border-color`, `--btn-color`, `--btn-color-hover`, `--label-title-color`
- Em **produção**: frontend na Hostinger (`https://forjaarcana.com`) + backend no Render (`https://dungeon-companion-api.onrender.com`) — domínios diferentes, portanto `withCredentials` é obrigatório

---

## 1. Pacotes necessários

Nenhum pacote adicional é necessário — usar apenas `@angular/common/http`.

---

## 2. Interceptor de Credenciais (`credentials.interceptor.ts`)

Criar em `src/app/interceptors/credentials.interceptor.ts`.

- Deve adicionar `withCredentials: true` **apenas** em requisições cujo `url` começa com `environment.apiUrl`
- Não deve modificar requisições para outros domínios (Google Fonts, etc.)

```typescript
// src/app/interceptors/credentials.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.apiUrl)) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
```

Registrar no `app.config.ts` adicionando `credentialsInterceptor` ao array de `withInterceptors([loadingInterceptor, credentialsInterceptor])`.

---

## 3. Models de Autenticação

Criar `src/app/models/auth.interface.ts`:

```typescript
export interface UserPublic {
  id: string;
  email: string;
  full_name?: string;
}

export interface AuthResponse {
  user: UserPublic;
}

export interface MeResponse {
  id: string;
  email: string;
}
```

---

## 4. AuthService (`src/app/services/auth.service.ts`)

Injectable `providedIn: 'root'`. Usar `signal<UserPublic | null>(null)` para estado do usuário logado.

### Contratos de API

| Método | Endpoint | Body | Resposta |
|---|---|---|---|
| POST | `/auth/signup` | `{email, password, full_name?}` | `{user}` — seta cookie |
| POST | `/auth/login` | `{email, password}` | `{user}` — seta cookie |
| POST | `/auth/logout` | — | `{message}` — limpa cookie |
| GET | `/auth/me` | — | `{id, email}` |
| POST | `/auth/forgot-password` | `{email}` | `{message}` |
| POST | `/auth/reset-password` | `{token, newPassword}` | `{message}` |

### Implementação

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private baseUrl = environment.apiUrl;

  readonly currentUser = signal<UserPublic | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  signup(email: string, password: string, fullName?: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/signup`, {
      email, password, full_name: fullName,
    }).pipe(tap(res => this.currentUser.set(res.user)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, { email, password })
      .pipe(tap(res => this.currentUser.set(res.user)));
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/logout`, {}).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.router.navigate(['/login']);
      }),
    );
  }

  // Chamado no boot da aplicação para restaurar a sessão se o cookie ainda for válido
  loadCurrentUser(): Observable<MeResponse | null> {
    return this.http.get<MeResponse>(`${this.baseUrl}/auth/me`).pipe(
      tap(me => this.currentUser.set({ id: me.id, email: me.email })),
      catchError(() => {
        this.currentUser.set(null);
        return of(null);
      }),
    );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/reset-password`, {
      token, newPassword,
    });
  }
}
```

---

## 5. AuthGuard (`src/app/guards/auth.guard.ts`)

```typescript
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) return true;

  // Cookie pode existir mas estado ainda não foi carregado (refresh de página)
  return authService.loadCurrentUser().pipe(
    map(user => user ? true : router.createUrlTree(['/login'])),
  );
};
```

---

## 6. Restaurar sessão no boot (`APP_INITIALIZER`)

No `app.config.ts`, adicionar um `APP_INITIALIZER` que chama `authService.loadCurrentUser()` antes da aplicação renderizar. Isso garante que ao dar F5 o usuário não seja redirecionado para login se o cookie ainda for válido.

```typescript
{
  provide: APP_INITIALIZER,
  useFactory: (authService: AuthService) => () => authService.loadCurrentUser(),
  deps: [AuthService],
  multi: true,
}
```

---

## 7. Rotas protegidas (`app.routes.ts`)

Adicionar as novas rotas de autenticação e proteger as existentes com `authGuard`:

```typescript
export const routes: Routes = [
  // Públicas
  { path: 'login',           loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'signup',          loadComponent: () => import('./auth/signup/signup.component').then(m => m.SignupComponent) },
  { path: 'forgot-password', loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'reset-password',  loadComponent: () => import('./auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },

  // Protegidas
  { path: '',               canActivate: [authGuard], loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
  { path: 'create',         canActivate: [authGuard], loadComponent: () => import('./character-wizard/character-wizard.component').then(m => m.CharacterWizardComponent) },
  { path: 'sheet-result',   canActivate: [authGuard], loadComponent: () => import('./character-sheet/character-sheet.component').then(m => m.CharacterSheetComponent) },
  { path: 'characters',     canActivate: [authGuard], loadComponent: () => import('./character-list/character-list.component').then(m => m.CharacterListComponent) },
  { path: 'character-sheet/:id', canActivate: [authGuard], loadComponent: () => import('./character-sheet/character-sheet.component').then(m => m.CharacterSheetComponent) },

  { path: '**', redirectTo: '' },
];
```

---

## 8. Componentes de Autenticação

Criar dentro de `src/app/auth/`. Todos são standalone. Manter o visual 8-bit RPG conforme o restante do projeto.

### Diretrizes visuais (obrigatórias)

- Font: `'Press Start 2P', monospace`
- Background do container: `var(--bg-color)` com centralização via flex
- Painel principal: `<fieldset>` com `border: 2px solid var(--border-color)`, `background: var(--panel-bg)`, `<legend>` com o título em maiúsculas
- Inputs: `background: var(--bg-color)`, `color: var(--text-color)`, `border: 1px solid var(--border-color)`, `font-family: 'Press Start 2P'`, `font-size: 8px`, `padding: 8px`
- Botões: classe `.retro-btn` já definida em `styles.scss` — usar sempre que possível
- Labels: `font-size: 8px`, `color: var(--label-title-color)`, `margin-bottom: 4px`
- Mensagens de erro: `color: #ff4444`, `font-size: 7px`, `margin-top: 4px`
- Links de navegação entre telas (ex: "Já tem conta?") : `color: var(--accent-color)`, `font-size: 7px`, `cursor: pointer`, `text-decoration: underline`
- Largura do painel: `400px`, `max-width: 90vw`

### 8.1 Login (`auth/login/login.component`)

**Campos:** email, password  
**Ações:** chamar `authService.login()`, em sucesso navegar para `/`  
**Links:** "CRIAR CONTA" → `/signup` | "ESQUECI A SENHA" → `/forgot-password`  
**Texto da legend:** `ENTRADA DA MASMORRA`

### 8.2 Signup (`auth/signup/signup.component`)

**Campos:** full_name (opcional), email, password, confirmPassword  
**Validação local:** `password === confirmPassword` antes de enviar  
**Ações:** chamar `authService.signup()`, em sucesso navegar para `/`  
**Links:** "JÁ SOU AVENTUREIRO" → `/login`  
**Texto da legend:** `FORJAR AVENTUREIRO`

### 8.3 Forgot Password (`auth/forgot-password/forgot-password.component`)

**Campos:** email  
**Ações:** chamar `authService.forgotPassword()`, exibir a mensagem retornada pelo backend  
**Links:** "VOLTAR" → `/login`  
**Texto da legend:** `RECUPERAR ACESSO`

### 8.4 Reset Password (`auth/reset-password/reset-password.component`)

**Campos:** newPassword, confirmPassword  
**Token:** ler da query string `?token=XYZ` via `ActivatedRoute`  
**Validação local:** `newPassword === confirmPassword`  
**Ações:** chamar `authService.resetPassword(token, newPassword)`, em sucesso navegar para `/login` com mensagem de confirmação  
**Texto da legend:** `NOVA SENHA SECRETA`

---

## 9. Botão de Logout

Adicionar botão de logout na `HomeComponent` (e/ou em um componente de header/nav se existir).

```typescript
logout() {
  this.authService.logout().subscribe();
}
```

HTML:
```html
<button class="retro-btn" (click)="logout()">SAIR</button>
```

---

## 10. Tratamento de 401 global (interceptor)

Criar `src/app/interceptors/auth-error.interceptor.ts`:

```typescript
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError(err => {
      if (err.status === 401 && !req.url.includes('/auth/')) {
        inject(AuthService).currentUser.set(null);
        inject(Router).navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
```

Registrar no `app.config.ts` após os demais interceptors.

---

## 11. Considerações de Produção (Hostinger + Render)

- O `credentialsInterceptor` garante `withCredentials: true` apenas para requisições à API — necessário para o browser enviar o cookie cross-origin
- O cookie tem `SameSite=None; Secure` no backend em `NODE_ENV=production` — funciona apenas sobre HTTPS (Hostinger e Render já proveem SSL)
- Em dev local (`http://localhost`) o cookie usa `SameSite=Lax` — funciona normalmente sem HTTPS
- **Nunca** armazenar o token em `localStorage` ou `sessionStorage` — o cookie HttpOnly já é suficiente e mais seguro
- O `APP_INITIALIZER` com `loadCurrentUser()` torna a restauração de sessão transparente para o usuário após reload

---

## 12. Checklist de implementação

- [ ] `credentialsInterceptor` criado e registrado em `app.config.ts`
- [ ] `authErrorInterceptor` criado e registrado em `app.config.ts`
- [ ] `AuthService` criado com todos os métodos
- [ ] `authGuard` criado
- [ ] `APP_INITIALIZER` registrado em `app.config.ts`
- [ ] Rotas atualizadas com `canActivate: [authGuard]` nas protegidas
- [ ] Componente `LoginComponent` criado
- [ ] Componente `SignupComponent` criado
- [ ] Componente `ForgotPasswordComponent` criado
- [ ] Componente `ResetPasswordComponent` criado
- [ ] Botão de logout adicionado na `HomeComponent`
