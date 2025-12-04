import { authApi, removeToken, type User } from '../../services/api'
import { AuthModal } from '../auth/AuthModal'

interface NavbarProps {
  user: User | null
  onUserChange: (user: User | null) => void
  showAuthModal: boolean
  onShowAuthModal: (show: boolean) => void
}

export function Navbar({ user, onUserChange, showAuthModal, onShowAuthModal }: NavbarProps) {
  const handleLogout = () => {
    removeToken()
    onUserChange(null)
  }

  const handleAuthSuccess = async () => {
    try {
      const response = await authApi.getCurrentUser()
      onUserChange(response.user)
      onShowAuthModal(false)
    } catch (err) {
      console.error('Failed to get user:', err)
    }
  }

  return (
    <>
      <nav className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600">
                  <span className="text-lg font-bold text-white">Н</span>
                </div>
                <span className="text-xl font-bold text-slate-900">НДС Калькулятор</span>
              </a>
              <div className="hidden md:flex items-center gap-6">
                <a href="/" className="text-sm font-medium text-slate-700 hover:text-sky-600 transition-colors">
                  Главная
                </a>
                <a href="/calculator" className="text-sm font-medium text-slate-700 hover:text-sky-600 transition-colors">
                  Калькулятор
                </a>
                {user && (
                  <a href="/reports" className="text-sm font-medium text-slate-700 hover:text-sky-600 transition-colors">
                    Мои отчеты
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="hidden sm:flex flex-col items-end text-xs">
                    <span className="font-medium text-slate-700">{user.name || user.email}</span>
                    <span className="text-slate-500">{user.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Выйти
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onShowAuthModal(true)}
                  className="rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-medium text-white hover:from-sky-700 hover:to-blue-700 transition-all shadow-sm"
                >
                  Войти / Регистрация
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => onShowAuthModal(false)} 
        onSuccess={handleAuthSuccess}
      />
    </>
  )
}

