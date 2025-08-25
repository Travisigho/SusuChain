;; title: susu-chain
;; version: 1.0.0
;; summary: Blockchain-based tontine (susu) smart contract
;; description: Weekly contribution tontine where participants contribute fixed amounts and one randomly selected person receives the total each week

;; constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-exists (err u102))
(define-constant err-insufficient-payment (err u103))
(define-constant err-round-not-active (err u104))
(define-constant err-round-active (err u105))
(define-constant err-already-paid (err u106))
(define-constant err-not-participant (err u107))
(define-constant err-round-not-ready (err u108))
(define-constant err-invalid-amount (err u109))

;; data vars
(define-data-var round-id uint u0)
(define-data-var contribution-amount uint u1000000) ;; 1 STX in micro-STX
(define-data-var round-duration uint u1008) ;; ~1 week in blocks (10 min blocks)
(define-data-var max-participants uint u52) ;; Maximum 52 participants (1 year of weeks)

;; data maps
(define-map rounds
    { round-id: uint }
    {
        start-block: uint,
        end-block: uint,
        total-pool: uint,
        participants: (list 52 principal),
        paid-participants: (list 52 principal),
        current-winner: (optional principal),
        is-active: bool,
        week-counter: uint,
    }
)

(define-map participant-status
    {
        round-id: uint,
        participant: principal,
    }
    {
        has-contributed: bool,
        contribution-week: uint,
        has-been-winner: bool,
        total-contributed: uint,
    }
)

(define-map participant-rounds
    { participant: principal }
    {
        active-round: (optional uint),
        round-count: uint,
    }
)

;; private functions
(define-private (is-contract-owner)
    (is-eq tx-sender contract-owner)
)

(define-private (get-pseudo-random
        (seed-height uint)
        (participants-count uint)
    )
    (let (
            (seed (+ seed-height (var-get round-id)))
            (hash-input (+ (* seed u1000000) stacks-block-height))
        )
        (mod hash-input participants-count)
    )
)

;; Helper functions for list operations
(define-private (remove-from-list
        (item principal)
        (lst (list 52 principal))
    )
    (get result
        (fold remove-item-fold lst {
            item: item,
            result: (list),
        })
    )
)

(define-private (remove-item-fold
        (current-item principal)
        (state {
            item: principal,
            result: (list 52 principal),
        })
    )
    {
        item: (get item state),
        result: (if (is-eq current-item (get item state))
            (get result state)
            (unwrap-panic (as-max-len? (append (get result state) current-item) u52))
        ),
    }
)

(define-private (add-to-list
        (item principal)
        (lst (list 52 principal))
    )
    (unwrap-panic (as-max-len? (append lst item) u52))
)

(define-private (list-contains
        (item principal)
        (lst (list 52 principal))
    )
    (is-some (index-of lst item))
)

;; Helper function to filter eligible participants
(define-private (get-eligible-participants-list
        (participants (list 52 principal))
        (paid-participants (list 52 principal))
    )
    (get result
        (fold filter-paid-fold participants {
            paid: paid-participants,
            result: (list),
        })
    )
)

(define-private (filter-paid-fold
        (participant principal)
        (state {
            paid: (list 52 principal),
            result: (list 52 principal),
        })
    )
    {
        paid: (get paid state),
        result: (if (list-contains participant (get paid state))
            (get result state)
            (unwrap-panic (as-max-len? (append (get result state) participant) u52))
        ),
    }
)

;; public functions
(define-public (create-round)
    (let (
            (new-round-id (+ (var-get round-id) u1))
            (start-block stacks-block-height)
            (end-block (+ stacks-block-height
                (* (var-get round-duration) (var-get max-participants))
            ))
        )
        (asserts! (is-contract-owner) err-owner-only)
        (map-set rounds { round-id: new-round-id } {
            start-block: start-block,
            end-block: end-block,
            total-pool: u0,
            participants: (list),
            paid-participants: (list),
            current-winner: none,
            is-active: true,
            week-counter: u0,
        })
        (var-set round-id new-round-id)
        (ok new-round-id)
    )
)

(define-public (join-round (target-round-id uint))
    (let (
            (round-data (unwrap! (map-get? rounds { round-id: target-round-id })
                err-not-found
            ))
            (current-participants (get participants round-data))
            (participant-count (len current-participants))
        )
        (asserts! (get is-active round-data) err-round-not-active)
        (asserts! (< participant-count (var-get max-participants))
            err-round-active
        )
        (asserts! (not (list-contains tx-sender current-participants))
            err-already-exists
        )

        (map-set rounds { round-id: target-round-id }
            (merge round-data { participants: (add-to-list tx-sender current-participants) })
        )

        (map-set participant-status {
            round-id: target-round-id,
            participant: tx-sender,
        } {
            has-contributed: false,
            contribution-week: u0,
            has-been-winner: false,
            total-contributed: u0,
        })

        (map-set participant-rounds { participant: tx-sender } {
            active-round: (some target-round-id),
            round-count: (+
                (default-to u0
                    (get round-count
                        (map-get? participant-rounds { participant: tx-sender })
                    ))
                u1
            ),
        })

        (ok true)
    )
)

(define-public (contribute (target-round-id uint))
    (let (
            (round-data (unwrap! (map-get? rounds { round-id: target-round-id })
                err-not-found
            ))
            (participant-data (unwrap!
                (map-get? participant-status {
                    round-id: target-round-id,
                    participant: tx-sender,
                })
                err-not-participant
            ))
            (contribution-amt (var-get contribution-amount))
            (current-week (/ (- stacks-block-height (get start-block round-data))
                (var-get round-duration)
            ))
        )
        (asserts! (get is-active round-data) err-round-not-active)
        (asserts! (not (get has-contributed participant-data)) err-already-exists)
        (asserts! (list-contains tx-sender (get participants round-data))
            err-not-participant
        )

        (try! (stx-transfer? contribution-amt tx-sender (as-contract tx-sender)))

        (map-set participant-status {
            round-id: target-round-id,
            participant: tx-sender,
        }
            (merge participant-data {
                has-contributed: true,
                contribution-week: current-week,
                total-contributed: (+ (get total-contributed participant-data) contribution-amt),
            })
        )

        (map-set rounds { round-id: target-round-id }
            (merge round-data { total-pool: (+ (get total-pool round-data) contribution-amt) })
        )

        (ok true)
    )
)

(define-public (select-winner (target-round-id uint))
    (let (
            (round-data (unwrap! (map-get? rounds { round-id: target-round-id })
                err-not-found
            ))
            (participants (get participants round-data))
            (paid-participants (get paid-participants round-data))
            (eligible-participants (get-eligible-participants-list participants paid-participants))
            (eligible-count (len eligible-participants))
            (current-week (/ (- stacks-block-height (get start-block round-data))
                (var-get round-duration)
            ))
        )
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (get is-active round-data) err-round-not-active)
        (asserts! (> eligible-count u0) err-round-not-ready)
        (asserts! (> current-week (get week-counter round-data))
            err-round-not-ready
        )

        (let (
                (random-index (get-pseudo-random (- stacks-block-height u1) eligible-count))
                (winner (unwrap-panic (element-at eligible-participants random-index)))
                (payout-amount (get total-pool round-data))
            )
            (try! (as-contract (stx-transfer? payout-amount tx-sender winner)))

            (map-set participant-status {
                round-id: target-round-id,
                participant: winner,
            }
                (merge
                    (unwrap-panic (map-get? participant-status {
                        round-id: target-round-id,
                        participant: winner,
                    })) { has-been-winner: true }
                ))

            (map-set rounds { round-id: target-round-id }
                (merge round-data {
                    current-winner: (some winner),
                    paid-participants: (add-to-list winner paid-participants),
                    total-pool: u0,
                    week-counter: current-week,
                    is-active: (< (len (add-to-list winner paid-participants))
                        (len participants)
                    ),
                })
            )

            (ok winner)
        )
    )
)

(define-public (end-round (target-round-id uint))
    (let ((round-data (unwrap! (map-get? rounds { round-id: target-round-id }) err-not-found)))
        (asserts! (is-contract-owner) err-owner-only)
        (asserts!
            (or
                (>= stacks-block-height (get end-block round-data))
                (is-eq (len (get paid-participants round-data))
                    (len (get participants round-data))
                )
            )
            err-round-active
        )

        (map-set rounds { round-id: target-round-id }
            (merge round-data { is-active: false })
        )

        (ok true)
    )
)

(define-public (set-contribution-amount (new-amount uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (> new-amount u0) err-invalid-amount)
        (var-set contribution-amount new-amount)
        (ok true)
    )
)

(define-public (set-max-participants (new-max uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (and (> new-max u0) (<= new-max u52)) err-invalid-amount)
        (var-set max-participants new-max)
        (ok true)
    )
)

;; read only functions
(define-read-only (get-round (target-round-id uint))
    (map-get? rounds { round-id: target-round-id })
)

(define-read-only (get-participant-status
        (target-round-id uint)
        (participant principal)
    )
    (map-get? participant-status {
        round-id: target-round-id,
        participant: participant,
    })
)

(define-read-only (get-participant-rounds (participant principal))
    (map-get? participant-rounds { participant: participant })
)

(define-read-only (get-current-round-id)
    (var-get round-id)
)

(define-read-only (get-contribution-amount)
    (var-get contribution-amount)
)

(define-read-only (get-max-participants)
    (var-get max-participants)
)

(define-read-only (get-round-duration)
    (var-get round-duration)
)

(define-read-only (is-participant
        (target-round-id uint)
        (participant principal)
    )
    (match (map-get? rounds { round-id: target-round-id })
        round-data (list-contains participant (get participants round-data))
        false
    )
)

(define-read-only (get-eligible-participants (target-round-id uint))
    (match (map-get? rounds { round-id: target-round-id })
        round-data (get-eligible-participants-list (get participants round-data)
            (get paid-participants round-data)
        )
        (list)
    )
)

(define-read-only (get-current-week (target-round-id uint))
    (match (map-get? rounds { round-id: target-round-id })
        round-data (/ (- stacks-block-height (get start-block round-data))
            (var-get round-duration)
        )
        u0
    )
)
