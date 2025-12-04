import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              Профессиональный сервис
              <span className="block text-slate-900 font-bold">
                для работы с НДС
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
              Надёжный инструмент для расчёта НДС, анализа налоговой нагрузки и формирования отчётности. 
              Разработано для бухгалтеров, предпринимателей и компаний.
            </p>

            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                to="/calculator"
                className="rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition"
              >
                Начать работу
              </Link>
              <Link
                to="/reports"
                className="rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Мои отчёты
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Вся работа с НДС — в одном сервисе
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Инструменты корпоративного уровня для точных расчётов и контроля операций
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
            {/* Card 1 */}
            <div className="flex flex-col rounded-xl bg-white p-8 shadow-md border border-slate-200 hover:shadow-lg transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-slate-900">Импорт данных</h3>
              <p className="mt-2 text-sm text-slate-600">
                Поддержка Excel, CSV, банковских выписок и файлов из 1С. Автоматическое определение структуры данных.
              </p>
            </div>

            {/* Card 2 */}
            <div className="flex flex-col rounded-xl bg-white p-8 shadow-md border border-slate-200 hover:shadow-lg transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-slate-900">Точный расчёт</h3>
              <p className="mt-2 text-sm text-slate-600">
                Автоматическое выделение входящего и исходящего НДС. Корректная обработка комиссий, возвратов и переводов.
              </p>
            </div>

            {/* Card 3 */}
            <div className="flex flex-col rounded-xl bg-white p-8 shadow-md border border-slate-200 hover:shadow-lg transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-amber-100">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-slate-900">Отчёты и аналитика</h3>
              <p className="mt-2 text-sm text-slate-600">
                Анализ операций, отчёты по периодам, графики движения НДС. Экспорт данных и управление статусами.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Начните работу сегодня</h2>
          <p className="mt-4 text-lg text-slate-600">
            Регистрация занимает меньше минуты. Полный функционал доступен сразу.
          </p>
          <div className="mt-8">
            <Link
              to="/calculator"
              className="inline-flex rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition"
            >
              Попробовать бесплатно
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
