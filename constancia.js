'use strict';

// Constancia de recepción para el cliente. A propósito no incluye el estado del caso:
// solo deja registro de lo recibido en tienda y de las condiciones de la garantía.
//
// Las condiciones resumen https://enjoyvideogames.com.co/garantia/ (revisada el 2026-11-04).
// Si la política cambia en la web, hay que actualizar POLITICA.

const EMPRESA = {
  nombre: 'Enjoy Videogames LLC',
  direccion: 'Calle 77 # 15-17, Edificio Tecno 77, Of. 402, Bogotá D.C.',
  whatsapp: '(313) 215-1661',
  correo: 'soporte@enjoyvideogames.com.co',
  web: 'enjoyvideogames.com.co',
};
const URL_POLITICA = 'https://enjoyvideogames.com.co/garantia/';

const POLITICA = {
  plazos: [
    ['Consolas, componentes de PC, laptops y productos Apple', '6 meses'],
    ['PC armados por Enjoy', '6 meses por pieza'],
    ['Productos open box', '3 meses'],
    ['Accesorios (controles, cargadores, audífonos, etc.)', '3 meses'],
    ['Videojuegos físicos', '1 mes'],
    ['Códigos digitales y tarjetas de regalo', 'Funcionamiento al momento de la entrega'],
  ],
  notaPlazos: 'La garantía Enjoy cuenta desde el día en que el cliente recibe su producto. Al terminar, el producto puede seguir cubierto por la garantía del fabricante, según el tiempo que le reste.',
  tramite: [
    'Revisamos el producto con un diagnóstico no invasivo para confirmar la falla, sin abrirlo.',
    'Lo tramitamos con el fabricante, cuyo servicio técnico autorizado emite el diagnóstico oficial y puede reparar, reemplazar piezas o cambiar el producto. Si no es posible, trabajamos con talleres aliados especializados en Colombia.',
    'Te informamos en cada paso hasta que el producto regrese a tus manos.',
  ],
  compromisos: 'Respondemos las solicitudes en 1 día hábil y el producto queda en manos del fabricante en máximo 30 días.',
  costos: [
    ['Dentro de la garantía Enjoy y la garantía procede', 'Enjoy paga todos los envíos: desde tu ciudad, a Estados Unidos, de regreso a Colombia y la entrega en tu dirección.'],
    ['Después de la garantía Enjoy, con garantía vigente del fabricante', 'Enjoy hace el trámite; el cliente paga los envíos a Estados Unidos y de regreso.'],
    ['El fabricante determina que la garantía no procede', 'El cliente asume los envíos nacionales e internacionales y la reparación, si decide hacerla. Estos costos se informan antes de enviar el producto.'],
  ],
  cubre: [
    'Defectos de fábrica en materiales o fabricación.',
    'Fallas de funcionamiento con uso normal y según las indicaciones del fabricante.',
    'Productos que no encienden o no funcionan al recibirlos.',
    'Reparación, reposición o cambio del producto o de sus componentes, según el diagnóstico del fabricante.',
    'Mano de obra de la reparación y diagnóstico inicial en Enjoy.',
  ],
  noCubre: [
    'Golpes, caídas, accidentes o daños físicos (pantallas o carcasas rotas, pines doblados).',
    'Humedad, contacto con líquidos u oxidación.',
    'Sobrevoltajes, descargas eléctricas o fuentes y cargadores inadecuados.',
    'Sellos de garantía o números de serie rotos, alterados o ilegibles.',
    'Productos abiertos, intervenidos o reparados por terceros no autorizados.',
    'Overclock o modificaciones no oficiales de firmware, BIOS o software.',
    'Fallas de software, virus, configuración o pérdida de información.',
    'Mala instalación, mal uso o embalaje inadecuado cuando el cliente envía el producto.',
    'Desgaste normal por uso.',
  ],
  importante: 'La garantía es personal e intransferible y se solicita con el número de pedido o factura. La procedencia de cada caso se determina con el diagnóstico técnico del fabricante. Antes de entregar tu producto, haz una copia de seguridad de tu información.',
};

const PDF_COLOR = {
  negro: [17, 17, 17],
  naranja: [244, 86, 10],
  texto: [34, 34, 40],
  tenue: [100, 100, 112],
  linea: [214, 214, 222],
  fondo: [245, 245, 248],
};

async function logoComoDataUrl() {
  const res = await fetch('assets/logo-enjoy.png');
  if (!res.ok) throw new Error('No se encontró el logo de la constancia.');
  const blob = await res.blob();
  return new Promise((ok, ko) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.onerror = () => ko(new Error('No se pudo leer el logo de la constancia.'));
    lector.readAsDataURL(blob);
  });
}

function formatoFecha(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function fechaDeHoy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function construirConstancia(c) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const logo = await logoComoDataUrl();

  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = 46;
  const UTIL = ANCHO - M * 2;
  const LIMITE = ALTO - 58;
  let y = 0;

  const color = (rgb) => doc.setTextColor(...rgb);
  const fuente = (estilo, tam) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); };

  function encabezado() {
    doc.setFillColor(...PDF_COLOR.negro);
    doc.rect(0, 0, ANCHO, 76, 'F');
    doc.setFillColor(...PDF_COLOR.naranja);
    doc.rect(0, 76, ANCHO, 3, 'F');
    doc.addImage(logo, 'PNG', M, 12, 131, 52, undefined, 'FAST');
    color([255, 255, 255]);
    fuente('bold', 14);
    doc.text('CONSTANCIA DE RECEPCIÓN', ANCHO - M, 36, { align: 'right' });
    fuente('normal', 9.5);
    doc.text('Producto en garantía', ANCHO - M, 51, { align: 'right' });
    y = 100;
  }

  function nuevaPaginaSiHaceFalta(alto) {
    if (y + alto <= LIMITE) return;
    doc.addPage();
    encabezado();
  }

  function seccion(titulo) {
    nuevaPaginaSiHaceFalta(40);
    y += 8;
    fuente('bold', 10.5);
    color(PDF_COLOR.negro);
    doc.text(titulo.toUpperCase(), M, y);
    y += 5;
    doc.setDrawColor(...PDF_COLOR.naranja);
    doc.setLineWidth(1.2);
    doc.line(M, y, M + UTIL, y);
    y += 14;
  }

  function parrafo(texto, { tam = 9, tono = PDF_COLOR.texto, estilo = 'normal', ancho = UTIL, x = M, avance = 4 } = {}) {
    fuente(estilo, tam);
    color(tono);
    const lineas = doc.splitTextToSize(texto, ancho);
    const altoLinea = tam * 1.3;
    nuevaPaginaSiHaceFalta(lineas.length * altoLinea);
    doc.text(lineas, x, y);
    y += lineas.length * altoLinea + avance;
  }

  // Filas etiqueta / valor: el valor puede ocupar varias líneas.
  function datos(filas) {
    const COL = 128;
    for (const [etiqueta, valor] of filas) {
      fuente('normal', 10);
      const lineas = doc.splitTextToSize(String(valor), UTIL - COL);
      const alto = lineas.length * 13 + 5;
      nuevaPaginaSiHaceFalta(alto);
      fuente('bold', 9);
      color(PDF_COLOR.tenue);
      doc.text(etiqueta, M, y);
      fuente('normal', 10);
      color(PDF_COLOR.texto);
      doc.text(lineas, M + COL, y);
      y += alto;
    }
    y += 4;
  }

  // Tabla de dos columnas con encabezado, ajustando el texto de cada celda.
  function tabla(columnas, filas, anchos) {
    const PAD = 6;
    const TAM = 8.5;
    const altoLinea = TAM * 1.25;
    const fila = (celdas, { titulo = false } = {}) => {
      fuente(titulo ? 'bold' : 'normal', TAM);
      const partidas = celdas.map((t, i) => doc.splitTextToSize(t, anchos[i] - PAD * 2));
      const alto = Math.max(...partidas.map((l) => l.length)) * altoLinea + PAD * 1.2;
      nuevaPaginaSiHaceFalta(alto);
      if (titulo) {
        doc.setFillColor(...PDF_COLOR.fondo);
        doc.rect(M, y, UTIL, alto, 'F');
      }
      color(titulo ? PDF_COLOR.negro : PDF_COLOR.texto);
      let x = M;
      partidas.forEach((lineas, i) => {
        doc.text(lineas, x + PAD, y + PAD + TAM * 0.55);
        x += anchos[i];
      });
      y += alto;
      doc.setDrawColor(...PDF_COLOR.linea);
      doc.setLineWidth(0.5);
      doc.line(M, y, M + UTIL, y);
    };
    fila(columnas, { titulo: true });
    filas.forEach((f) => fila(f));
    y += 8;
  }

  function vinetas(items, { x = M, ancho = UTIL, tam = 8.5 } = {}) {
    const altoLinea = tam * 1.28;
    fuente('normal', tam);
    color(PDF_COLOR.texto);
    for (const item of items) {
      const lineas = doc.splitTextToSize(item, ancho - 10);
      nuevaPaginaSiHaceFalta(lineas.length * altoLinea + 2);
      doc.text('•', x, y);
      doc.text(lineas, x + 10, y);
      y += lineas.length * altoLinea + 2;
    }
  }

  const ALTO_FIRMAS = 84;

  function firmas() {
    y += 34;
    const ancho = (UTIL - 40) / 2;
    const dos = M + ancho + 40;
    doc.setDrawColor(...PDF_COLOR.texto);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + ancho, y);
    doc.line(dos, y, dos + ancho, y);
    y += 12;
    fuente('bold', 9);
    color(PDF_COLOR.texto);
    doc.text('Recibe por Enjoy Videogames', M, y);
    doc.text('Entrega el cliente', dos, y);
    y += 12;
    fuente('normal', 9);
    color(PDF_COLOR.tenue);
    doc.text(c.recibido_por, M, y, { maxWidth: ancho });
    doc.text(c.cliente_nombre, dos, y, { maxWidth: ancho });
    y += 10;
  }

  function piesDePagina() {
    const total = doc.getNumberOfPages();
    for (let n = 1; n <= total; n += 1) {
      doc.setPage(n);
      doc.setDrawColor(...PDF_COLOR.linea);
      doc.setLineWidth(0.5);
      doc.line(M, ALTO - 44, ANCHO - M, ALTO - 44);
      fuente('bold', 7.5);
      color(PDF_COLOR.texto);
      doc.text(EMPRESA.nombre, M, ALTO - 32);
      fuente('normal', 7.5);
      color(PDF_COLOR.tenue);
      doc.text(EMPRESA.direccion, M, ALTO - 22);
      doc.text(`WhatsApp ${EMPRESA.whatsapp} · ${EMPRESA.correo} · ${EMPRESA.web}`, M, ALTO - 12);
      doc.text(`${c.numero_caso} · Página ${n} de ${total}`, ANCHO - M, ALTO - 32, { align: 'right' });
    }
  }

  // ---------- Página 1: lo recibido ----------
  encabezado();

  fuente('bold', 11);
  color(PDF_COLOR.negro);
  doc.text(`Caso de garantía ${c.numero_caso}`, M, y);
  fuente('normal', 9);
  color(PDF_COLOR.tenue);
  doc.text(`Fecha de emisión: ${fechaDeHoy()}`, ANCHO - M, y, { align: 'right' });
  y += 16;

  seccion('Datos del cliente');
  datos([
    ['Nombre', c.cliente_nombre],
    ['Número del cliente', c.cliente_numero],
    ['Número de pedido', c.numero_pedido],
  ]);

  seccion('Producto recibido');
  datos([
    ['Producto', c.producto],
    ['Número serial', c.numero_serial],
    ['Falla reportada', c.falla],
  ]);

  seccion('Recepción en tienda');
  datos([
    ['Fecha de recibido', formatoFecha(c.fecha_recibido)],
    ['Recibido por', c.recibido_por],
  ]);

  parrafo(`${EMPRESA.nombre} deja constancia de haber recibido el producto descrito para iniciar el trámite de garantía. Esta constancia no implica que la garantía proceda: la procedencia de cada caso se determina con el diagnóstico técnico del fabricante.`, { avance: 8 });

  seccion('Tiempos de la garantía Enjoy');
  tabla(['Producto', 'Garantía Enjoy'], POLITICA.plazos, [UTIL - 190, 190]);
  parrafo(POLITICA.notaPlazos, { tam: 8.5, tono: PDF_COLOR.tenue });

  // Una falla muy larga puede no dejar espacio: entonces las firmas van al final del
  // documento, para no dejar una página solo con ellas.
  const firmasEnPrimeraPagina = y + ALTO_FIRMAS <= LIMITE;
  if (firmasEnPrimeraPagina) firmas();

  // ---------- Página 2: condiciones ----------
  doc.addPage();
  encabezado();

  seccion('Cómo sigue el trámite');
  vinetas(POLITICA.tramite);
  y += 3;
  parrafo(POLITICA.compromisos, { tam: 8.5, estilo: 'bold', avance: 6 });

  seccion('¿Quién paga los envíos?');
  tabla(['Situación', 'Envíos y trámite'], POLITICA.costos, [UTIL * 0.42, UTIL * 0.58]);

  seccion('Qué cubre y qué no cubre');
  const inicio = y;
  const anchoCol = (UTIL - 24) / 2;
  fuente('bold', 9);
  color(PDF_COLOR.negro);
  doc.text('La garantía cubre', M, y);
  doc.text('La garantía no cubre', M + anchoCol + 24, inicio);
  y += 13;
  const yListas = y;
  vinetas(POLITICA.cubre, { ancho: anchoCol });
  const finCubre = y;
  y = yListas;
  vinetas(POLITICA.noCubre, { x: M + anchoCol + 24, ancho: anchoCol });
  y = Math.max(y, finCubre) + 6;

  seccion('Importante');
  parrafo(POLITICA.importante, { tam: 8.5, avance: 8 });

  fuente('bold', 9);
  color(PDF_COLOR.negro);
  nuevaPaginaSiHaceFalta(14);
  doc.text('Política completa de garantía:', M, y);
  const anchoTitulo = doc.getTextWidth('Política completa de garantía: ');
  fuente('normal', 9);
  doc.setTextColor(...PDF_COLOR.naranja);
  doc.textWithLink(URL_POLITICA, M + anchoTitulo, y, { url: URL_POLITICA });

  if (!firmasEnPrimeraPagina) {
    nuevaPaginaSiHaceFalta(ALTO_FIRMAS);
    firmas();
  }

  piesDePagina();
  doc.setProperties({
    title: `Constancia de recepción - ${c.numero_caso}`,
    author: EMPRESA.nombre,
    subject: 'Recepción de producto en garantía',
  });
  return doc;
}

async function generarConstancia(c) {
  const doc = await construirConstancia(c);
  doc.save(`constancia-${c.numero_caso}.pdf`);
}
