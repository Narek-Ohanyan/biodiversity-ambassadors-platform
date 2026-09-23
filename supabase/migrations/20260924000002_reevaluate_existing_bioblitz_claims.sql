-- One-time correction: reject every currently-approved bioblitz claim whose claimant is not on the
-- manager's confirmed attendance roster, with the same effects a manual rejection would have
-- (notification + publication re-sync). Matched claims and already-decided ones are left untouched.
do $$
declare c record;
  note text := 'Ձեր անունը հայտնաբերված չէ BioBlitz-ի մասնակիցների հաստատված ցանկում։ / Not found on the confirmed BioBlitz attendance list.';
begin
  for c in select * from public.claims where activity_key = 'bioblitz' and status = 'approved' loop
    if not private.bioblitz_match(c.user_id) then
      update public.claims set status = 'rejected', auto = true, manager_comment = note, decided_at = now() where id = c.id;
      perform private.notify(c.user_id, 'claim_rejected', jsonb_build_object('activity', c.activity_key, 'credits', c.credits, 'comment', note));
      perform private.sync_publication(c.user_id);
    end if;
  end loop;
end $$;
