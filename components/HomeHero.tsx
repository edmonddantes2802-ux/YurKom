import Qualifier from '@/components/Qualifier';
import { TRUST_MARKERS } from '@/content/company';

const HOME_CHIPS = [
  { label: 'Заблокировали счёт', prefix: 'Заблокировали счёт: ' },
  { label: 'Привлекают лично', prefix: 'Меня привлекают к ответственности лично: ' },
  { label: 'Налоговая проверка', prefix: 'Налоговая проверка: ' },
  { label: 'Иск к компании', prefix: 'К компании подан иск: ' },
];

export default function HomeHero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div data-reveal>
          <h1>Антикризисная юридическая защита бизнеса</h1>
          <p className="hero-subtitle">
            Работаем с ситуациями, где счёт идёт на дни: блокировки счетов, субсидиарная
            ответственность, налоговые споры, защита личных активов.
          </p>

          <div className="hero-trust">
            {TRUST_MARKERS.map((marker) => (
              <div className="hero-trust-item" key={marker.value}>
                <span className="hero-trust-value">{marker.value}</span>
                <span className="hero-trust-label">{marker.label}</span>
              </div>
            ))}
          </div>
        </div>

        <Qualifier
          slug="homepage"
          source="homepage"
          prompt="Опишите, что происходит. Если не знаете, к какому направлению это относится, — просто расскажите своими словами."
          chips={HOME_CHIPS}
          placeholder="Например: пришло требование из налоговой на 6 млн, счёт заблокирован…"
          note="Реагируем в течение 30 минут"
        />
      </div>
    </section>
  );
}
