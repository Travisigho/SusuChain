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
