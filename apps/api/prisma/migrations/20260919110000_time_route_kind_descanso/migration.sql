-- Marcador explicito de descanso en la malla. Una malla puede ser de tipo 'trabajo' (por defecto)
-- o 'descanso'. El motor de liquidacion paga un dia solo si tiene marcacion, descanso explicito o
-- licencia remunerada; un dia sin ninguno de estos no se paga.
ALTER TABLE "TimeRoute" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'trabajo';
