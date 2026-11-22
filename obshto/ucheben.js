/*
  Общ двигател за интерактивните уроци.
    1. Четене на глас (Web Speech API).
    2. Редактор на живо: код вляво, резултат вдясно.
    3. Говорещ урок: кодът се пише сам, а гласът обяснява (като видео).
    4. Предизвикателство на стъпки с автоматична проверка.
    5. Проект с изисквания, които се проверяват наведнъж.
    6. Проверка на знанията и тренировка до овладяване.
  Работи и без сървър: отворете HTML файла в браузър.
  Страниците не се пишат на ръка. Генерират се от generator/build.py.
*/
var Uchebnik = (function () {

  /* ---------- Помощни функции ---------- */

  function zapazi(kluch, stoinost) {
    try { localStorage.setItem("uchebnik:" + kluch, JSON.stringify(stoinost)); } catch (e) {}
  }
  function procheti(kluch, poUmolchanie) {
    try {
      var s = localStorage.getItem("uchebnik:" + kluch);
      return s === null ? poUmolchanie : JSON.parse(s);
    } catch (e) { return poUmolchanie; }
  }
  function razbarkai(masiv) {
    for (var i = masiv.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = masiv[i]; masiv[i] = masiv[j]; masiv[j] = t;
    }
    return masiv;
  }

  // Показва кода в рамката и връща обещание с живия документ.
  // Живият документ има изчислени стилове, затова можем да проверяваме и CSS.
  function izobrazi(prozorec, kod) {
    return new Promise(function (gotovo) {
      var svarshi = false;
      function kraj() {
        if (svarshi) return;
        svarshi = true;
        var d = null, w = null;
        try { d = prozorec.contentDocument; w = prozorec.contentWindow; } catch (e) {}
        if (!d || !d.body) {
          // Ако браузърът не позволи достъп, проверяваме само структурата
          d = new DOMParser().parseFromString(kod, "text/html");
          w = window;
        }
        gotovo({ d: d, w: w });
      }
      prozorec.onload = function () { setTimeout(kraj, 30); };
      prozorec.srcdoc = kod;
      setTimeout(kraj, 1500);
    });
  }

  // Помощници, които проверките в уроците могат да ползват.
  // Пример: P.stil(d.querySelector("h1"), "color")
  var P = {
    tekst: function (e) { return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; },
    stil: function (e, svoistvo) {
      if (!e) return "";
      var w = e.ownerDocument.defaultView || window;
      return w.getComputedStyle(e).getPropertyValue(svoistvo).trim();
    },
    // Превръща всеки запис на цвят (red, #f00, rgb) в един и същ вид, за да сравняваме
    cvyat: function (d, zapis) {
      var e = d.createElement("span");
      e.style.color = "";
      e.style.color = zapis;
      if (!e.style.color) return "";
      d.body.appendChild(e);
      var c = (d.defaultView || window).getComputedStyle(e).color;
      e.remove();
      return c;
    },
    // Дали е зададен цвят, различен от началния (черен текст или прозрачен фон)
    imaCvyat: function (stoinost) {
      return stoinost && stoinost !== "rgba(0, 0, 0, 0)" && stoinost !== "transparent";
    },
    px: function (stoinost) { return parseFloat(stoinost) || 0; },
    // Премахва коментарите от CSS и HTML код, за да не се брои закоментиран код
    bezKomentari: function (kod) {
      return kod.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    }
  };

  /* ---------- 1. Четене на глас ---------- */

  function balgarskiGlas() {
    if (!("speechSynthesis" in window)) return null;
    var glasove = speechSynthesis.getVoices();
    for (var i = 0; i < glasove.length; i++) {
      if (glasove[i].lang && glasove[i].lang.toLowerCase().indexOf("bg") === 0) return glasove[i];
    }
    return null;
  }

  function tekstZaChetene(element) {
    if (element.dataset && element.dataset.izgovor) return element.dataset.izgovor;
    var kopie = element.cloneNode(true);
    kopie.querySelectorAll("[data-izgovor]").forEach(function (e) { e.textContent = e.dataset.izgovor; });
    kopie.querySelectorAll(".podskazka, .obratna").forEach(function (e) { e.remove(); });
    return kopie.textContent.replace(/\s+/g, " ").trim();
  }

  var skorost = procheti("skorost", 0.95);

  function kazhi(tekst, sledTova) {
    if (!("speechSynthesis" in window)) return false;
    var iz = new SpeechSynthesisUtterance(tekst);
    iz.lang = "bg-BG";
    iz.rate = skorost;
    var glas = balgarskiGlas();
    if (glas) iz.voice = glas;
    if (sledTova) { iz.onend = sledTova; iz.onerror = sledTova; }
    speechSynthesis.speak(iz);
    return true;
  }

  function chetiTekstove(tekstove, suvet) {
    if (!("speechSynthesis" in window)) {
      if (suvet) suvet.textContent = "Този браузър не може да чете на глас. Използвайте текстовия файл с приложение за четене.";
      return;
    }
    speechSynthesis.cancel();
    if (suvet) suvet.textContent = balgarskiGlas() ? "" : "Няма български глас в този браузър. Опитайте с Microsoft Edge.";
    tekstove.forEach(function (t) { if (t) kazhi(t); });
  }

  function nastroiChetene() {
    document.querySelectorAll("[data-cheti]").forEach(function (buton) {
      buton.addEventListener("click", function () {
        var razdel = document.getElementById(buton.dataset.cheti);
        if (!razdel) return;
        var tekstove = [];
        razdel.querySelectorAll("h1, h2, h3, p, li, legend, label, figcaption").forEach(function (e) {
          if (e.closest("pre, .redaktor, .cheti, .ne-cheti, .obratna, .podskazka, .saobshtenie")) return;
          if (e.tagName === "P" && e.closest("li")) return;
          tekstove.push(tekstZaChetene(e));
        });
        chetiTekstove(tekstove, razdel.querySelector(".suvet-glas"));
      });
    });
    document.querySelectorAll("[data-spri]").forEach(function (b) {
      b.addEventListener("click", function () { if ("speechSynthesis" in window) speechSynthesis.cancel(); });
    });
    document.querySelectorAll(".izbor-skorost").forEach(function (s) {
      s.value = String(skorost);
      s.addEventListener("change", function () { skorost = Number(s.value); zapazi("skorost", skorost); });
    });
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  }

  /* ---------- 2. Редактор на живо ---------- */

  var redaktori = {};

  function napraviRedaktor(kutiya) {
    var pole = kutiya.querySelector("textarea");
    var prozorec = kutiya.querySelector("iframe");
    var nachalen = pole.value;
    var kluch = "kod:" + location.pathname + ":" + kutiya.id;
    if (!kutiya.hasAttribute("data-bez-pamet")) {
      var zapazen = procheti(kluch, null);
      if (zapazen !== null) pole.value = zapazen;
    }
    var taimer = null;
    function obnovi() {
      prozorec.srcdoc = pole.value;
      if (!kutiya.hasAttribute("data-bez-pamet")) zapazi(kluch, pole.value);
    }
    pole.addEventListener("input", function () {
      clearTimeout(taimer);
      taimer = setTimeout(obnovi, 300);
    });
    // Tab вмъква два интервала. За да излезете от полето с клавиатурата, натиснете Esc и после Tab.
    var izlez = false;
    pole.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { izlez = true; return; }
      if (e.key === "Tab" && !izlez && !e.shiftKey) {
        e.preventDefault();
        var a = pole.selectionStart, b = pole.selectionEnd;
        pole.value = pole.value.slice(0, a) + "  " + pole.value.slice(b);
        pole.selectionStart = pole.selectionEnd = a + 2;
        obnovi();
      }
      izlez = false;
    });
    var nulirai = document.querySelector('[data-nulirai="' + kutiya.id + '"]');
    if (nulirai) nulirai.addEventListener("click", function () { pole.value = nachalen; obnovi(); });
    obnovi();
    redaktori[kutiya.id] = {
      pole: pole, prozorec: prozorec, nachalen: nachalen,
      postavi: function (kod) { pole.value = kod; obnovi(); }
    };
  }

  /* ---------- 3. Говорещ урок (видеообяснение) ---------- */

  // Всяка сцена има текст за глас и пълния код след сцената.
  // Плейърът изписва промяната буква по буква, докато гласът говори.
  function govoreshtUrok(n) {
    var r = redaktori[n.redaktor];
    var kutiya = document.getElementById(n.kutiya);
    var sceni = n.sceni;
    var subtitri = kutiya.querySelector(".subtitri");
    var bPusni = kutiya.querySelector(".pusni");
    var bNazad = kutiya.querySelector(".nazad");
    var bNapred = kutiya.querySelector(".napred");
    var lenta = kutiya.querySelector(".lenta");
    var nomer = kutiya.querySelector(".nomer-scena");
    var tekushta = 0, varvi = false, pisane = null, chakane = null, pokolenie = 0;

    function kodPredi(i) { return i === 0 ? (n.nachalen || "") : sceni[i - 1].kod; }

    function pokazhiSastoyanie() {
      bPusni.textContent = varvi ? "❚❚ Пауза" : (tekushta >= sceni.length ? "↺ Отначало" : "▶ Пусни");
      lenta.style.width = (100 * Math.min(tekushta, sceni.length) / sceni.length) + "%";
      nomer.textContent = "Сцена " + Math.min(tekushta + 1, sceni.length) + " от " + sceni.length;
    }

    function spri() {
      pokolenie++;
      varvi = false;
      clearInterval(pisane);
      clearTimeout(chakane);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      pokazhiSastoyanie();
    }

    // Изписва разликата между стария и новия код
    function napishi(star, nov, zavarshi) {
      var a = 0;
      while (a < star.length && a < nov.length && star[a] === nov[a]) a++;
      var b = 0;
      while (b < star.length - a && b < nov.length - a &&
             star[star.length - 1 - b] === nov[nov.length - 1 - b]) b++;
      var nachalo = nov.slice(0, a), sreda = nov.slice(a, nov.length - b), kraj = nov.slice(nov.length - b);
      var i = 0;
      r.postavi(nachalo + kraj);
      clearInterval(pisane);
      if (!sreda) { zavarshi(); return; }
      var stapka = Math.max(1, Math.round(sreda.length / 120));
      pisane = setInterval(function () {
        i = Math.min(sreda.length, i + stapka);
        r.pole.value = nachalo + sreda.slice(0, i) + kraj;
        r.pole.selectionStart = r.pole.selectionEnd = a + i;
        if (i % 6 === 0 || i === sreda.length) r.prozorec.srcdoc = r.pole.value;
        if (i >= sreda.length) { clearInterval(pisane); r.postavi(nov); zavarshi(); }
      }, 45);
    }

    function igrai(i) {
      var moe = ++pokolenie;
      tekushta = i;
      if (i >= sceni.length) { varvi = false; pokazhiSastoyanie(); return; }
      varvi = true;
      pokazhiSastoyanie();
      var sc = sceni[i];
      subtitri.textContent = sc.govor;
      var gotovGlas = false, gotovKod = false;
      function oshte() {
        if (moe !== pokolenie) return;
        if (gotovGlas && gotovKod) {
          chakane = setTimeout(function () { if (moe === pokolenie) igrai(i + 1); }, 700);
        }
      }
      // Говорим само с български глас. Без него показваме субтитри и оставяме време за четене.
      var vremeZaChetene = 1500 + sc.govor.length * 60 / skorost;
      if (balgarskiGlas() && kazhi(sc.izgovor || sc.govor, function () { gotovGlas = true; oshte(); })) {
        chakane = setTimeout(function () { gotovGlas = true; oshte(); }, vremeZaChetene * 1.6);
      } else {
        chakane = setTimeout(function () { gotovGlas = true; oshte(); }, vremeZaChetene);
      }
      napishi(kodPredi(i), sc.kod, function () { gotovKod = true; oshte(); });
    }

    bPusni.addEventListener("click", function () {
      if (varvi) { spri(); return; }
      if (tekushta >= sceni.length) tekushta = 0;
      r.postavi(kodPredi(tekushta));
      igrai(tekushta);
    });
    bNazad.addEventListener("click", function () {
      spri();
      tekushta = Math.max(0, tekushta - 1);
      r.postavi(kodPredi(tekushta));
      subtitri.textContent = sceni[tekushta].govor;
      pokazhiSastoyanie();
    });
    bNapred.addEventListener("click", function () {
      spri();
      tekushta = Math.min(sceni.length - 1, tekushta + 1);
      r.postavi(kodPredi(tekushta));
      subtitri.textContent = sceni[tekushta].govor;
      pokazhiSastoyanie();
    });
    // Ако ученикът започне да пише, урокът спира, за да не му пречи
    r.pole.addEventListener("keydown", function () { if (varvi) spri(); });
    r.postavi(n.nachalen || "");
    subtitri.textContent = "Натиснете Пусни. Можете да спрете по всяко време и да промените кода сами.";
    pokazhiSastoyanie();
  }

  /* ---------- 4. Предизвикателство на стъпки ---------- */

  function izpalniProverka(f, d, kod, w) {
    try { return f(d, kod, w, P); }
    catch (e) { return "Не намирам нужния елемент или в кода има грешка. Проверете дали всички тагове и скоби са затворени."; }
  }

  function predizvikatelstvo(n) {
    var r = redaktori[n.redaktor];
    var spisak = document.getElementById(n.spisak);
    var stapki = spisak.querySelectorAll(":scope > li");
    var saobshtenie = document.getElementById(n.saobshtenie);
    var kluch = "stapka:" + location.pathname + ":" + n.spisak;
    var tekushta = procheti(kluch, 0);

    function pokazhi() {
      stapki.forEach(function (li, i) {
        li.classList.toggle("gotova", i < tekushta);
        li.classList.toggle("tekushta", i === tekushta);
        li.classList.toggle("zaklyuchena", i > tekushta);
      });
      if (tekushta >= stapki.length) {
        saobshtenie.className = "saobshtenie dobre";
        saobshtenie.textContent = n.kraj || "Браво! Изпълнихте всички стъпки.";
      }
    }

    document.getElementById(n.proveri).addEventListener("click", function () {
      if (tekushta >= stapki.length) { pokazhi(); return; }
      var kod = r.pole.value;
      izobrazi(r.prozorec, kod).then(function (x) {
        var otgovor = izpalniProverka(n.proverki[tekushta], x.d, P.bezKomentari(kod), x.w);
        if (otgovor === true) {
          tekushta++;
          zapazi(kluch, tekushta);
          saobshtenie.className = "saobshtenie dobre";
          saobshtenie.textContent = tekushta < stapki.length ? "Точно така! Продължете със стъпка " + (tekushta + 1) + "." : "";
        } else {
          saobshtenie.className = "saobshtenie losho";
          saobshtenie.textContent = otgovor;
        }
        pokazhi();
      });
    });
    document.getElementById(n.podskazka).addEventListener("click", function () {
      var li = stapki[Math.min(tekushta, stapki.length - 1)];
      var p = li.querySelector(".podskazka");
      if (p) p.classList.add("vidima");
    });
    document.getElementById(n.otnachalo).addEventListener("click", function () {
      tekushta = 0;
      zapazi(kluch, 0);
      r.postavi(r.nachalen);
      saobshtenie.textContent = "";
      spisak.querySelectorAll(".podskazka").forEach(function (p) { p.classList.remove("vidima"); });
      pokazhi();
    });
    pokazhi();
  }

  /* ---------- 5. Проект ---------- */

  // Всички изисквания се проверяват наведнъж. Проектът е свободен, затова проверките са общи.
  function proekt(n) {
    var r = redaktori[n.redaktor];
    var spisak = document.getElementById(n.spisak);
    var iziskvaniya = spisak.querySelectorAll(":scope > li");
    var saobshtenie = document.getElementById(n.saobshtenie);
    document.getElementById(n.proveri).addEventListener("click", function () {
      var kod = r.pole.value;
      izobrazi(r.prozorec, kod).then(function (x) {
        var izpalneni = 0;
        iziskvaniya.forEach(function (li, i) {
          var otg = izpalniProverka(n.proverki[i], x.d, P.bezKomentari(kod), x.w);
          var ok = otg === true;
          if (ok) izpalneni++;
          li.classList.toggle("gotova", ok);
          var bel = li.querySelector(".obratna");
          if (bel) bel.textContent = ok ? "" : otg;
        });
        saobshtenie.className = "saobshtenie " + (izpalneni === iziskvaniya.length ? "dobre" : "losho");
        saobshtenie.textContent = izpalneni === iziskvaniya.length
          ? "Всички изисквания са изпълнени. Сега добавете нещо свое, за да стане проектът наистина ваш."
          : "Изпълнени изисквания: " + izpalneni + " от " + iziskvaniya.length + ".";
      });
    });
  }

  /* ---------- 6а. Проверка на знанията ---------- */

  function proverkaNaZnaniyata(idRazdel) {
    var razdel = document.getElementById(idRazdel);
    var rezultat = razdel.querySelector(".rezultat");
    razdel.querySelector(".proveri-testa").addEventListener("click", function () {
      var vaprosi = razdel.querySelectorAll(".vapros");
      var verni = 0;
      vaprosi.forEach(function (v) {
        var izbran = v.querySelector("input:checked");
        var obratna = v.querySelector(".obratna");
        if (izbran && izbran.value === v.dataset.veren) {
          verni++;
          obratna.className = "obratna saobshtenie dobre";
          obratna.textContent = "Вярно. " + (v.dataset.obyasnenie || "");
        } else {
          obratna.className = "obratna saobshtenie losho";
          obratna.textContent = (izbran ? "Не е вярно. " : "Не сте избрали отговор. ") + (v.dataset.obyasnenie || "");
        }
      });
      rezultat.textContent = "Верни отговори: " + verni + " от " + vaprosi.length + ".";
      zapazi("test:" + location.pathname, verni + "/" + vaprosi.length);
    });
  }

  /* ---------- 6б. Тренировка до овладяване ---------- */

  // Видове въпроси:
  //   { vid: "izbor", tekst, otgovori: [...], veren: индекс, obyasnenie }
  //   { vid: "vpishi", tekst, verni: [...], obyasnenie }
  //   { vid: "kod", tekst, nachalen, proverka: функция(документ, код, прозорец, P), obyasnenie }
  function trenirovka(n) {
    var kutiya = document.getElementById(n.kutiya);
    var celta = n.poRed || 5;
    var kluch = "trenirovka:" + location.pathname;
    var danni = procheti(kluch, { naiDobro: 0, ovladyano: false });
    var opashka = [], podRed = 0, tekusht = null, poslednaObratna = "";
    var el = {
      broyach: kutiya.querySelector(".broyach"),
      tochki: kutiya.querySelector(".tochki"),
      tekst: kutiya.querySelector(".tekst-vapros"),
      pole: kutiya.querySelector(".pole-otgovor"),
      proveri: kutiya.querySelector(".proveri-otgovor"),
      sledvasht: kutiya.querySelector(".sledvasht"),
      obratna: kutiya.querySelector(".obratna-trenirovka"),
      cheti: kutiya.querySelector(".cheti-vaprosa")
    };

    function risuvaiTochki() {
      var html = "";
      for (var i = 0; i < celta; i++) html += '<span class="tochka' + (i < podRed ? " pulna" : "") + '"></span>';
      el.tochki.innerHTML = html;
      el.broyach.textContent = "Верни поред: " + podRed + " от " + celta + ". " +
        (danni.ovladyano ? "Тази тренировка вече е овладяна." : "Най-добър резултат: " + danni.naiDobro + ".");
    }

    function sledvasht() {
      if (opashka.length === 0) {
        opashka = razbarkai(n.vaprosi.slice());
        if (tekusht && opashka.length > 1 && opashka[opashka.length - 1] === tekusht) opashka.unshift(opashka.pop());
      }
      tekusht = opashka.pop();
      el.tekst.textContent = tekusht.tekst;
      el.obratna.textContent = "";
      poslednaObratna = "";
      el.obratna.className = "obratna-trenirovka saobshtenie";
      el.sledvasht.hidden = true;
      el.proveri.hidden = false;
      el.pole.innerHTML = "";
      if (tekusht.vid === "izbor") {
        var redove = tekusht.otgovori.map(function (o, i) { return { o: o, i: i }; });
        razbarkai(redove).forEach(function (red) {
          var label = document.createElement("label");
          var radio = document.createElement("input");
          radio.type = "radio"; radio.name = "otg"; radio.value = red.i;
          label.appendChild(radio);
          label.appendChild(document.createTextNode(" " + red.o));
          el.pole.appendChild(label);
        });
      } else if (tekusht.vid === "vpishi") {
        var vhod = document.createElement("input");
        vhod.type = "text"; vhod.className = "vhod";
        vhod.setAttribute("aria-label", "Вашият отговор");
        vhod.setAttribute("autocomplete", "off");
        vhod.addEventListener("keydown", function (e) { if (e.key === "Enter") proveri(); });
        el.pole.appendChild(vhod);
        vhod.focus();
      } else {
        el.pole.innerHTML =
          '<div class="redaktor"><div><div class="eticheta">Код</div><textarea spellcheck="false" aria-label="Код"></textarea></div>' +
          '<div><div class="eticheta">Резултат</div><iframe title="Резултат"></iframe></div></div>';
        var ta = el.pole.querySelector("textarea"), fr = el.pole.querySelector("iframe");
        ta.value = tekusht.nachalen || "";
        fr.srcdoc = ta.value;
        var t = null;
        ta.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { fr.srcdoc = ta.value; }, 300); });
      }
    }

    function otsenka(veren, dopalnitelno) {
      if (veren) {
        podRed++;
        el.obratna.className = "obratna-trenirovka saobshtenie dobre";
        el.obratna.textContent = "Вярно! " + (tekusht.obyasnenie || "");
      } else {
        podRed = 0;
        el.obratna.className = "obratna-trenirovka saobshtenie losho";
        el.obratna.textContent = "Не съвсем. " + (dopalnitelno || "") + (tekusht.obyasnenie || "");
      }
      if (podRed > danni.naiDobro) danni.naiDobro = podRed;
      if (podRed >= celta) {
        danni.ovladyano = true;
        el.obratna.textContent += " Овладяхте тренировката! Можете да продължите, за да затвърдите знанията.";
        podRed = 0;
      }
      poslednaObratna = el.obratna.textContent;
      zapazi(kluch, danni);
      risuvaiTochki();
      el.proveri.hidden = true;
      el.sledvasht.hidden = false;
      el.sledvasht.focus();
    }

    function proveri() {
      if (tekusht.vid === "izbor") {
        var izbran = el.pole.querySelector("input:checked");
        if (!izbran) { el.obratna.textContent = "Изберете отговор."; return; }
        otsenka(Number(izbran.value) === tekusht.veren);
      } else if (tekusht.vid === "vpishi") {
        var s = el.pole.querySelector(".vhod").value.toLowerCase().replace(/\s+/g, "");
        if (!s) { el.obratna.textContent = "Напишете отговор."; return; }
        otsenka(tekusht.verni.some(function (v) { return v.toLowerCase().replace(/\s+/g, "") === s; }));
      } else {
        var kod = el.pole.querySelector("textarea").value;
        izobrazi(el.pole.querySelector("iframe"), kod).then(function (x) {
          var r = izpalniProverka(tekusht.proverka, x.d, P.bezKomentari(kod), x.w);
          otsenka(r === true, r === true ? "" : r + " ");
        });
      }
    }

    el.proveri.addEventListener("click", proveri);
    el.sledvasht.addEventListener("click", sledvasht);
    el.cheti.addEventListener("click", function () {
      var t = [tekusht.izgovor || tekusht.tekst];
      if (tekusht.vid === "izbor") {
        el.pole.querySelectorAll("label").forEach(function (l, i) { t.push("Отговор " + (i + 1) + ". " + l.textContent.trim()); });
      }
      if (poslednaObratna) t.push(poslednaObratna);
      chetiTekstove(t, null);
    });
    risuvaiTochki();
    sledvasht();
  }

  /* ---------- Начална страница: отбелязва преминатите уроци ---------- */

  function otbelezhiProgres() {
    document.querySelectorAll("[data-progres]").forEach(function (a) {
      var pat = a.dataset.progres;
      var nadpis = null;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k.indexOf("uchebnik:trenirovka:") === 0 && k.indexOf(pat) !== -1) {
            if (JSON.parse(localStorage.getItem(k)).ovladyano) nadpis = "овладяна";
          }
          if (k.indexOf("uchebnik:test:") === 0 && k.indexOf(pat) !== -1) nadpis = "тест: " + JSON.parse(localStorage.getItem(k));
        }
      } catch (e) {}
      if (nadpis) {
        var s = document.createElement("span");
        s.className = "znachka";
        s.textContent = nadpis;
        a.after(s);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    nastroiChetene();
    document.querySelectorAll(".redaktor[id]").forEach(napraviRedaktor);
    otbelezhiProgres();
  });

  return {
    govoreshtUrok: govoreshtUrok,
    predizvikatelstvo: predizvikatelstvo,
    proekt: proekt,
    proverkaNaZnaniyata: proverkaNaZnaniyata,
    trenirovka: trenirovka,
    P: P
  };
})();
