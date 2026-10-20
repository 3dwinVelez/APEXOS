-- QA only: SCJ vehicles -> SUCURSAL PRINCIPAL, explicitly selected by the user.
-- DML only. Existing accounting units, operational sites and ledger entries are preserved.
BEGIN;
DO $backfill$
DECLARE
  company_id constant text := 'cbbf3627-4336-4f23-95c6-1077414bcd17';
  branch_code constant text := '200720';
  tenant_config jsonb;
  tree jsonb;
  branch jsonb;
  centers jsonb;
  existing jsonb;
  vehicle record;
  center_code text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(company_id || ':accounting-numbering', 0));
  SELECT config INTO STRICT tenant_config FROM "Tenant" WHERE id=company_id AND name='SCJ' FOR UPDATE;
  tree := tenant_config->'accounting'->'organization_tree';
  SELECT item INTO STRICT branch FROM jsonb_array_elements(tree->'branches') item
    WHERE item->>'code'=branch_code AND COALESCE((item->>'active')::boolean,true);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(tree->'societies') s WHERE s->>'code'=branch->>'society_code' AND COALESCE((s->>'active')::boolean,true)) THEN
    RAISE EXCEPTION 'SCJ_ACTIVE_SOCIETY_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM "Vehicle" WHERE tenant_id=company_id) <> 17 THEN RAISE EXCEPTION 'SCJ_VEHICLE_INVENTORY_CHANGED'; END IF;
  centers := COALESCE(tree->'cost_centers','[]'::jsonb);
  FOR vehicle IN SELECT id,plate,cost_center,base_site,active,status,metadata FROM "Vehicle" WHERE tenant_id=company_id ORDER BY id FOR UPDATE LOOP
    SELECT item INTO existing FROM jsonb_array_elements(centers) item WHERE (item->>'vehicle_id')::integer=vehicle.id;
    center_code := COALESCE(existing->>'code',upper(btrim(vehicle.plate)));
    IF center_code IS NULL OR center_code='' THEN RAISE EXCEPTION 'SCJ_VEHICLE_PLATE_REQUIRED'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(centers) item WHERE item->>'code'=center_code AND
      (COALESCE(item->>'vehicle_id','')<>vehicle.id::text OR item->>'branch_code'<>branch_code OR item->>'society_code'<>branch->>'society_code')) THEN
      RAISE EXCEPTION 'SCJ_COST_CENTER_CONFLICT';
    END IF;
    SELECT COALESCE(jsonb_agg(item),'[]'::jsonb) INTO centers FROM jsonb_array_elements(centers) item WHERE item->>'code'<>center_code;
    centers := centers || jsonb_build_array(jsonb_build_object('code',center_code,'name','Vehiculo '||vehicle.plate,'society_code',branch->>'society_code','branch_code',branch_code,'vehicle_id',vehicle.id,'active',vehicle.active AND vehicle.status NOT IN ('retirado','inactivo')));
    UPDATE "Vehicle" SET cost_center=center_code, metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('accounting_branch_code',branch_code)
      WHERE tenant_id=company_id AND id=vehicle.id;
    IF vehicle.cost_center IS DISTINCT FROM center_code OR vehicle.metadata->>'accounting_branch_code' IS DISTINCT FROM branch_code THEN
      INSERT INTO "AuditLog"(tenant_id,action,module,entity,entity_id,old_value,new_value)
      VALUES(company_id,'vehicle.accounting_center.backfill','transport','Vehicle',vehicle.id::text,
        jsonb_build_object('cost_center',vehicle.cost_center,'accounting_branch_code',vehicle.metadata->>'accounting_branch_code'),
        jsonb_build_object('cost_center',center_code,'accounting_branch_code',branch_code,'source','20261020-scj-vehicle-cost-centers','authorization','Usuario: SUCURSAL PRINCIPAL (200720) para todos'));
    END IF;
  END LOOP;
  UPDATE "Tenant" SET config=jsonb_set(tenant_config,'{accounting,organization_tree}',jsonb_set(tree,'{cost_centers}',centers,true),true) WHERE id=company_id;
END;
$backfill$;
COMMIT;
