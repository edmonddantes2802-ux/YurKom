/**
 * Блок доверия. Метка слева называет аспект, по которому даётся обещание, —
 * это делает список проверяемым, а не набором лозунгов.
 */
const POINTS = [
  {
    tag: "Сроки",
    title: "Смотрим документы в день обращения",
    desc: "В кризисе решение нужно сегодня, а не после согласования регламентов. Говорим, что делать в ближайшие часы, ещё до заключения договора.",
  },
  {
    tag: "Профиль",
    title: "Работаем там, где уже горит",
    desc: "Не спокойное сопровождение, а дела, где наложен арест, подан иск, назначена проверка или предъявлены требования лично к вам.",
  },
  {
    tag: "Активы",
    title: "Отделяем бизнес от личного имущества",
    desc: "Выстраиваем защиту так, чтобы обязательства компании не дошли до вашей квартиры, счетов и автомобиля.",
  },
  {
    tag: "Условия",
    title: "Стоимость и объём фиксируем до старта",
    desc: "Вы понимаете, за что платите и какой исход реален. Без «оценим по ходу» и открытых счётчиков.",
  },
];

export default function WhyUs() {
  return (
    <section className="section why">
      <div className="container">
        <div className="sec-head" data-reveal>
          <span className="kicker">Почему мы</span>
          <h2>Как устроена наша работа</h2>
        </div>

        <div className="why-list">
          {POINTS.map((point, i) => (
            <article
              className="why-item"
              key={point.tag}
              data-reveal
              data-reveal-delay={String(Math.min(i + 1, 5))}
            >
              <span className="why-tag">{point.tag}</span>
              <div>
                <h3 className="why-title">{point.title}</h3>
                <p className="why-desc">{point.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
