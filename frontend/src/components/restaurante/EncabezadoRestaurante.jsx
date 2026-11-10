import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Cabecera comun del restaurante: mismo "volver + titulo" que la cancha. */
export default function EncabezadoRestaurante({
  kicker, title, text, backTo = '/restaurante', backLabel = 'Volver al restaurante', actions,
}) {
  return (
    <>
      <Link to={backTo} className="bmb-back"><ArrowLeft size={16} />{backLabel}</Link>
      <header className="bmb-intro">
        <div>
          <p className="bmb-eyebrow">ROJAS MORA SPORTS & LODGE</p>
          <h1><span>{kicker}</span>{title}</h1>
        </div>
        <div className="bmb-intro-side">
          {text && <p>{text}</p>}
          {actions}
        </div>
      </header>
    </>
  );
}
