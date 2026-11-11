/** HU-024: leyenda de colores del panel de mesas. */
export default function TableLegend() {
  return (
    <ul className="rst-legend" aria-label="Leyenda de estados">
      <li><span className="rst-legend-swatch is-available" aria-hidden="true" />Disponible</li>
      <li><span className="rst-legend-swatch is-occupied" aria-hidden="true" />Ocupada</li>
      <li><span className="rst-legend-swatch is-inactive" aria-hidden="true" />Inactiva</li>
    </ul>
  );
}
