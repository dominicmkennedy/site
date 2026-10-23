---
title: "Mangy Ranges: Comparing interval abstractions in LLVM and other compilers"
description: "A study of different interval domains, comparing how each balances expressiveness, mathematical structure, and efficiency, and which ones compilers use."
published: 2026-10-23
---

Interval analysis of some form or another is found in most modern compilers.
Yet these compilers have each reinvented the wheel with a slightly different domain,
and there's little documentation as to why.
The theory behind these domains [has been covered](https://dl.acm.org/doi/10.1145/2651360), but not the engineering tradeoffs.
While working on an upcoming POPL paper,
I got nerd-sniped trying to understand what those tradeoffs are and how they affect the compiler.

In this post, we'll study three interval domains,
beginning with LLVM's, examining the tradeoffs implicit in its design.
In trying to avoid LLVM's engineering complications, we'll construct a cleaner alternative--only to find that it's less expressive. 
We'll combine two complementary versions of that simpler design to recover this lost precision, and find out exactly what that costs in storage.
Along the way, we'll compare how the three designs balance expressiveness, mathematical structure, and efficiency,
before surveying which variants are used in common compilers.

## The briefest primer

This post assumes only the faintest familiarity with abstract interpretation,
and for the unacquainted reader, there's a [gentle introduction](https://bernsteinbear.com/blog/toy-abstract-interpretation/) from a compiler's point of view,
but I will also provide a brief background below.
Although not strictly necessary, there's also an excellent post on using the [KnownBits domain for optimizations](https://pypy.org/posts/2024/08/toy-knownbits.html).

The big idea behind abstract interpretation is to give sound and precise bounds on a program's behavior.
It helps me to think about it like this:

Given a function $f: A \to B,$ we want to find a subset of $B$ called $\mathit{out},$ such that $\forall x \in A, f(x) \in \mathit{out},$
i.e. for any possible input to $f$ the result can be found in $\mathit{out}.$

For a production compiler, soundness is a non-negotiable. We say that an analysis is _unsound_ if $\exists x \in A, f(x) \notin \mathit{out}.$

Precision, on the other hand, must be balanced against speed; no one likes slow compile times. 
A _precise_ analysis is one that minimizes the size of $\mathit{out}.$

Part of this balancing act is finding a cheap representation for $\mathit{out}.$
The aforementioned KnownBits domain is cheap to store, but its representation is very imprecise for certain common sets, such as $\{0, -1\},$
which KnownBits must represent as a vector of unknown bits, i.e. the set of all possible values.

Cheap and precise aren't the only things we need from a representation, though.
There's a tricky third requirement, stemming from the lossy nature of our representation.
In the KnownBits example from above, the singleton sets $\{0\}$ and $\{-1\}$ can each be represented exactly on their own,
but there's no exact representation for their union.
We patch this hole with the _join_ operator, written $\sqcup,$ which stands in for set union.
We define $\mathit{out}_1 \sqcup \mathit{out}_2$ to be the smallest representable set that overapproximates $\mathit{out}_1 \cup \mathit{out}_2.$
For $\sqcup$ to be well-defined, that smallest overapproximation must be unique.
The same problem arises for set intersection, and we define an analogous _meet_ operator, written $\sqcap.$
When join and meet are well-defined in this way, the representable subsets of $B$ form a [lattice](https://en.wikipedia.org/wiki/Lattice_(order)).
The lattice is the third requirement and is an important component in proving soundness and termination of an analysis.

## LLVM's ConstantRange

For our function $f: A \to B,$ a conventional interval analysis overapproximates the possible outputs, $\mathit{out} \subseteq B,$ with only two values!
These are $\min \{ f(x) \mid x \in A \}$ and $\max \{ f(x) \mid x \in A \},$
and we take $\mathit{out}$ to be every value between them.
Together, these bounds describe the _interval hull_ of $f(A).$

This is pretty much how LLVM's `ConstantRange` [class](https://llvm.org/doxygen/ConstantRange_8cpp_source.html) represents contiguous ranges of bitvector values.
For a bitwidth $w,$ LLVM stores a half-open interval $[\mathit{lb}, \mathit{ub})$ representing the set of bitvectors $\{\mathit{lb}, \mathit{lb}+1, \dots, \mathit{ub}-1\}.$
But there's a small wrinkle since machine integers can overflow and wrap back around.
So LLVM adds the rule that if $\mathit{lb} > \mathit{ub},$ then the represented set is $\{\mathit{lb}, \mathit{lb}+1, \dots, \mathit{max\_val}, \mathit{min\_val}, \dots, \mathit{ub}-1\}.$[^1]
To represent $\bot$ (the empty set), LLVM uses $\mathit{lb} = \mathit{ub} = 0,$ and to represent $\top$ (the full set), LLVM uses $\mathit{lb} = \mathit{ub} = 2^w - 1.$
Any other values of $\mathit{lb} = \mathit{ub}$ are forbidden.

Simple enough!
Now let's reason through a concrete example:

```c
unsigned char f(bool x) {
    unsigned char y;
    if (x) { y = 0; } 
    else   { y = 128; } 

    return y;
}
```

What is the abstract value (range) of $y$ at the function return?

Easy!
It is the union of what happens in the `if` and `else` branches.
But LLVM represents only contiguous ranges, not arbitrary sets, and $\{0\} \cup \{128\} = \{0, 128\}$ is not a range.
Instead we use the join operator on our ranges of both branches: $[0, 1) \sqcup [128, 129) = [0, 129).$
The resulting range represents the set $\{0, 1, \dots, 127, 128\}.$

But remember that `ConstantRange` can wrap around the unsigned interval, so why not use $[128, 1),$ representing the set $\{128, 129, \dots, 255, 0\},$
instead? 
The range wraps after $255,$ since `y` is an `unsigned char` with a bitvector width of $8.$

To understand which range is correct, we recall that an abstract interpretation requires its abstract values (ranges, in this case) to form a lattice,
and that in a lattice, the join of any two elements is defined to be the unique smallest range covering both inputs.

So let's just check the sizes of $[0, 129)$ and $[128, 1) \dots$

$\dots$ well son of a gun.
Both ranges contain exactly 129 elements.

### Not a lattice?!?

LLVM's `ConstantRange` domain isn't a lattice, which raises some uncomfortable questions:

**1. The [seminal paper on abstract interpretation](https://dl.acm.org/doi/10.1145/512950.512973) introduces a lattice of intervals. Is the paper wrong?**

No.
There's a subtle distinction in the algebra of the underlying datatype.
The Cousots' interval domain is defined over $\mathbb{Z},$ which is a linearly ordered group,
whereas LLVM operates on bitvector representatives of $\mathbb{Z} / 2^w \mathbb{Z}$ (for some width $w$),
which is a cycle, with no first or last element.
I visualize $\mathbb{Z}$ as a number line stretching infinitely in both directions,
and $\mathbb{Z} / 2^w \mathbb{Z}$ as a "number circle" with no definite beginning or end.
```
Number line:

   -4   -3   -2   -1   0    1    2    3    4
<---|----|----|----|---|----|----|----|----|--->

Number circle:

            15 %%   %% 0
      14 %%               %% 1

   13 %%                      %% 2

12 %%                            %% 3

11 %%                            %% 4

   10 %%                      %% 5

       9 %%               %% 6
             8 %%   %% 7
```

If you're yelling at your screen that $15 > 0,$ so drawing the numbers in a circle is utter nonsense,
I'd like you to consider that $15>0$ but $15+1 \ngtr 0+1$ (a fact that C++ programmers love to employ).

LLVM's `ConstantRange` respects this cyclic structure by admitting all contiguous ranges, regardless of which boundary they wrap across.

The number circle above represents $\mathbb{Z} / 16\mathbb{Z},$ and by looking at it, it is apparent that
any pair of elements on the circle invites exactly two ranges using those elements as endpoints,
one going around the circle in each direction.
For example, $\{1, 15\}$ gives a range with $\{1, 2, \dots, 15\}$ and one with $\{15, 0, 1\}.$
In this case the latter range is obviously much smaller than the former,
but if the two elements are antipodes on the circle (e.g. $\{0, 8\}$), then neither range is more precise than the other.

In comparison, any pair of elements in $\mathbb{Z}$ invites only one interval with those elements as its endpoints.
This is what allows a proper lattice of intervals over $\mathbb{Z}.$

**2. Abstract interpretation is built on top of a lattice. Is LLVM's `ConstantRange` unsound?**

Not quite. Both ranges include the values $0$ and $128,$ so using either range constitutes a perfectly sound overapproximation.
There are other concerns when using an abstract domain not backed by a lattice, such as nonterminating analyses, but all of these issues are skirted with additional engineering.
We've already seen one of these: since neither $[0, 129)$ nor $[128, 1)$ is smaller, LLVM's join, [`unionWith`](https://github.com/llvm/llvm-project/blob/d24c23a5f9f7d83e27710b7aa50a9282be4dffcf/llvm/lib/IR/ConstantRange.cpp#L707-L778), breaks the tie by argument order,
so $[0, 1) \sqcup [128, 129) = [128, 1)$ but $[128, 129) \sqcup [0, 1) = [0, 129).$
Commutativity is one of the things a lattice would have given us for free.

**3. Is there even a lattice of intervals over bitvectors?**

Spoiler alert: yes.[^2]
But let's see if it appears naturally as we study LLVM's `ConstantRange` further.

**4. Why doesn't LLVM use this lattice design?**

LLVM's implementation follows very naturally from the semantics of its bitvector operations.
For example, the arithmetic bitvector operations `add`, `sub`, and `mul` all operate on a number circle;[^3]
they are indifferent to signed or unsigned interpretation, and their results can cross over any boundary.

Other LLVM components also integrate well with this design.
LLVM's Scalar Evolution DSL has a flag, `nw` (no-self-wrap, not to be confused with `nsw` and `nuw`),
meaning that a recurrence never returns to its starting value.
`ConstantRange`'s arbitrarily wrapping ranges are perfectly suited to tracking values that cross some boundary without completing a full trip around the number circle.[^4]

However, `ConstantRange`'s definition of intervals comes with a downside:

The only reason LLVM bothers to track intervals is to prove dataflow facts that can be used to fire optimizations.
The consumers of `ConstantRange` analyses care about some facts more than others, not just how small a range is.
That's why LLVM's `computeConstantRange` function takes a `ForSigned` flag: 
it tells the analysis to prefer ranges that don't wrap under the signed (or unsigned) interpretation. 
This leads to more engineering work for abstract operations which have more than one most precise result. 
Abstract multiplication is one such case, and much of the [function](https://github.com/llvm/llvm-project/blob/d24c23a5f9f7d83e27710b7aa50a9282be4dffcf/llvm/lib/IR/ConstantRange.cpp#L1209-L1305) implementing it is devoted to deciding which kind of range to return.

Although LLVM's arithmetic operations don't "care" about wrapping,
it's common for these operations to have the `nsw` or `nuw` flags (no signed wrap and no unsigned wrap, respectively).
Unlike the cyclicity of a plain `add`, `add nsw` promises that the sum fits on the signed number line 
(otherwise the result is poison rather than a wrapped value).
So an `nsw` flag obviates the need for an interval which crosses over the signed boundary, and the opposite is true of a `nuw` flag.

If the analysis is written with two separate range interpretations in mind, and most uses of arithmetic operations cut the circle into a line anyway,
then maybe `ConstantRange` isn't a super-powerful interval domain, but two average interval domains hiding in a trench coat.

## Setting boundaries

Okay, so there are pros and cons to LLVM's approach. I get it.
But what if I have a language with only `unsigned` integers, and all arithmetic operations have the `nuw` flag?
Then I probably want my interval analysis to always return a range that respects the unsigned interval boundary.
We can do this by using the unsigned interpretation of bitvectors from $\mathbb{Z} / 2^w \mathbb{Z}$ and ordering the elements by that interpretation
(this ordering operator is written $\leq_\text{u}$).
Doing this means rejecting the cyclic ordering and instead imposing a total order on the set.
This cuts the number circle into a finite number line with endpoints `uint_min` and `uint_max`.
For $w=3$ we get this line:
```
 0    1    2    3    4    5    6    7
||----|----|----|----|----|----|----||
```

Formally, we define the domain `UnsignedRange` to consist of $\bot$ and all intervals $[\mathit{lb}, \mathit{ub}]$ such that $\mathit{lb} \leq_\text{u} \mathit{ub}.$
Note that, unlike `ConstantRange`, `UnsignedRange` stores closed intervals, since a half-open interval with a $w$-bit $\mathit{ub}$ could never include the value $2^w - 1.$
Looking back to our previous code example, we can now say that the abstract value of $y$ must be $[0, 128],$
since the stricter invariant rules out the other range.
In fact, all possible "ties" are broken, and `UnsignedRange` forms a true lattice,
even though its abstract values are just a subset of those in `ConstantRange`.

This is not the only way to cut the number circle;
we can also define the analogous `SignedRange` domain,
where we use the signed interpretation of bitvectors for our total order, so $\mathit{lb} \leq_\text{s} \mathit{ub}$:[^5]
in this case the cut point is between `int_min` and `int_max`.
Giving this line:
```
-4   -3   -2   -1    0    1    2    3
||----|----|----|----|----|----|----||
```
Once again recalling the previous code example, this domain must make the opposite choice for $y$: $[-128, 0].$

Using a domain that is strictly less expressive than `ConstantRange` seems like a disadvantage.
But since the intervals of `UnsignedRange` are a subset of those in `ConstantRange`, maybe they can be stored more efficiently?

Recall that LLVM spends two $w$-bit bitvectors to store each range, so `UnsignedRange` would need far fewer than $2^{2w}$ intervals to do better.
Its intervals are the $[\mathit{lb}, \mathit{ub}]$ with $0 \leq \mathit{lb} \leq \mathit{ub} < 2^w,$ so for each $\mathit{lb}$ there are $2^w - \mathit{lb}$ choices for $\mathit{ub}.$
Summing them up:
$$
\sum_{\mathit{lb}=0}^{2^w-1} (2^w - \mathit{lb}) = \frac{2^w(2^w+1)}{2}
$$
Darn, that's more than $2^{2w-1},$ which still takes $2w$ bits to encode.
Any encoding of `UnsignedRange` will use the same space as LLVM's `ConstantRange`.

My take here is that the only reason to use `UnsignedRange` or `SignedRange` instead of LLVM's `ConstantRange` is that you need a lattice.
Maybe you can't afford the extra engineering that a non-lattice domain needs,
or maybe you want to formally reason about your analysis, which gets much harder without a lattice.[^6]
But if that's the case, then how do you decide between `UnsignedRange` and `SignedRange`?

## ¿Por qué no los dos?

We can take the _product_ of `UnsignedRange` and `SignedRange` to create a new domain that we'll denote by $\mathrm{UR}\times\mathrm{SR}.$
Each element of this domain is a pair of ranges: one that respects the unsigned interval boundary and one that respects the signed interval boundary.
Formally, the elements of this domain are:

$(\mathit{ur}, \mathit{sr}) \in \mathrm{UR}\times\mathrm{SR} \iff \mathit{ur} \in$ `UnsignedRange` and $\mathit{sr} \in$ `SignedRange`

The underlying set represented by the pair of ranges $(\mathit{ur}, \mathit{sr})$ is the intersection of the two ranges: $\mathit{ur} \cap \mathit{sr}.$

Let's re-examine our code example, where we want $\{0\} \sqcup \{128\}.$
The unsigned range is $[0, 128],$ and the signed range is $[-128, 0]$ 
(recall $-128$ is the signed interpretation of the bitvector for $128$).

Together, they form the pair $([0, 128], [-128, 0]),$ whose intersection represents exactly the set $\{0, 128\}.$
This is much better than LLVM's `ConstantRange` can manage: regardless of which range it chooses, that range will represent a set containing 129 elements.

A win for our new domain!
Now let's reason about this code:

```c
unsigned char f(unsigned char x) {
  unsigned char y;
  if (x == 7) { y = 0; }
  else        { y = x; }

  return y;
}
```

In this case, at function return $y$ could be any value _except_ for $7.$
Since there is no unsigned or signed range to represent this, our new domain must represent it as $\top$ (since $\mathit{ur} = [0, 255]$ and $\mathit{sr} = [-128, 127]$).
LLVM on the other hand can represent the possible values of $y$ with perfect fidelity using $[8, 7),$ the range which represents all values except $7.$

After seeing this example, a professor I'm working with said, "It takes twice the storage of LLVM, and it isn't even strictly more powerful?"
Even though this seems like a pathological case, it's frustrating to be punked by LLVM's range domain.
So if the product domain isn't strictly more expressive than LLVM's, maybe it can at least be stored more efficiently.

## Reducing the problem, literally

To find a more space-efficient encoding of this product, first notice that
although a pair of ranges can represent underlying sets more precisely,
many underlying sets have more than one representation as a pair of ranges.
That redundancy comes on top of the bit patterns that aren't valid `UnsignedRange` or `SignedRange` values at all
(anything with $\mathit{lb} > \mathit{ub}$).

For example: in the pair $([1, 3], [-3, -1]),$ the ranges have no overlapping values,
so their intersection is $\emptyset,$ and this is just a complicated way of writing $\bot.$
There are also many cases where one range doesn't add any information to the other, such as the element: $([0, 100], [20, 20]),$
in which case the intersection represents the singleton set $\{20\}$ and the unsigned component hasn't provided any information.

The fix here is a reduction operator, which canonicalizes abstract values by the underlying set they represent.[^7]
The hope is that the canonical representatives for each underlying set
form a much smaller set of abstract values than all pairs of ranges form, and are therefore cheaper to store.

### Intersection via union

**Goal:** We want to canonicalize elements in $\mathrm{UR}\times\mathrm{SR}$ by the underlying set they represent.

First, it helps to visualize what a pair of ranges $(\mathit{ur}, \mathit{sr}) \in \mathrm{UR}\times\mathrm{SR}$ looks like.
`UnsignedRange` and `SignedRange` turn the same circle of bitvectors into two different linear orderings by cutting it at different points.
Here are both orderings for $w=3$; the underlying bitvectors are shown above, 
with the corresponding unsigned and signed interpretations on each number line.
Notice that for both lines the values increase left to right, except over their respective cut points, marked `||`.
```
bits 000  001  010  011  100  101  110  111
       0    1    2    3    4    5    6    7
UR:    ||--------------------------------||
       0    1    2    3   -4   -3   -2   -1
SR:    ---------------||  ||---------------
```
Now let's examine the element $([1, 6], [-3, 2])$ with this visual,
where `XXXX` marks values inside the interval and `----` marks values outside it.
```
bits 000  001  010  011  100  101  110  111
       0    1    2    3    4    5    6    7
UR:    ||---XXXXXXXXXXXXXXXXXXXXXXXXXX---||
       0    1    2    3   -4   -3   -2   -1
SR:    XXXXXXXXXXX----||  ||----XXXXXXXXXXX
```
The intersection of the two ranges consists of the portions where they overlap, in this case it's the unsigned values $\{1, 2, 5, 6\}.$
Under the signed interpretation, the same bitvectors represent the set $\{1, 2, -3, -2\}.$

We see that this intersection is not one single interval under either ordering,
but it does fall into two contiguous pieces, $[1, 2]$ and $[5, 6],$ and each piece falls between the two cut points.
So let's try cutting the number circle at both cut points, partitioning it into two halves:
```
        0    1    2    3    4    5    6    7
UR:     ||--------------------------------||
        0    1    2    3   -4   -3   -2   -1
SR:     ---------------||  ||---------------

Halves: ||-------------||  ||-------------||
```
Neither ordering is cut within a half, so the relations $\leq_\text{u}$ and $\leq_\text{s}$ coincide within each half.
Therefore $\mathit{ur}$ and $\mathit{sr}$ behave like ordinary intervals on each half.
The intersection of two intervals is either an interval or empty, so each half contains either one arc of $\mathit{ur} \cap \mathit{sr}$ or nothing.

Let's show these arcs in our example from before and see:
```
        0    1    2    3    4    5    6    7
UR:     ||---XXXXXXXXXXXXXXXXXXXXXXXXXX---||
        0    1    2    3   -4   -3   -2   -1
SR:     XXXXXXXXXXX----||  ||----XXXXXXXXXXX

Halves: ||---XXXXXX----||  ||----XXXXXX---||
```
Writing every value as unsigned, we see that:
$$
\begin{aligned}
\mathit{ur} \cap \mathit{sr} &= \{1, 2, 3, 4, 5, 6\} \cap \{0, 1, 2, 5, 6, 7\} &= \{1, 2, 5, 6\} \\
\mathit{arc}_1 \cup \mathit{arc}_2 &= \{1 ,2\} \cup \{5, 6\} &= \{1, 2, 5, 6\}
\end{aligned}
$$
The _intersection_ of $\mathit{ur}$ and $\mathit{sr}$ is exactly the _union_ of the arcs!
This is true of all $(\mathit{ur}, \mathit{sr})$ pairs, but I won't bore you with the proof.

That's a cool party trick, but does it actually help us get to the reduced product?
Remember that different elements in $\mathrm{UR}\times\mathrm{SR}$ can represent the same underlying set.
For example, $([1, 2], [1, 2]),$ $([0, 7], [1, 2]),$ and $([1, 2], [-4, 3])$ all represent the set $\{1, 2\}.$
The arcs, however, depend only on the set itself. 
This is because the arc on each half is exactly the part of the set that lies on that half.
With our example, all three pairs would give $[1, 2]$ on the first half and nothing on the second.
Let's draw all three pairs and their arcs:
```
        Range pair: ([1, 2], [1, 2])

        0    1    2    3    4    5    6    7
UR:     ||---XXXXXX-----------------------||
        0    1    2    3   -4   -3   -2   -1
SR:     -----XXXXXX----||  ||---------------

Halves: ||---XXXXXX----||  ||-------------||

        Range pair: ([0, 7], [1, 2])

        0    1    2    3    4    5    6    7
UR:     ||XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX||
        0    1    2    3   -4   -3   -2   -1
SR:     -----XXXXXX----||  ||---------------

Halves: ||---XXXXXX----||  ||-------------||

        Range pair: ([1, 2], [-4, 3])

        0    1    2    3    4    5    6    7
UR:     ||---XXXXXX-----------------------||
        0    1    2    3   -4   -3   -2   -1
SR:     XXXXXXXXXXXXXXX||  ||XXXXXXXXXXXXXXX

Halves: ||---XXXXXX----||  ||-------------||
```
Notice that all three pairs give exactly the same arcs, since the arcs depend _only_ on the underlying set!
So two pairs represent the same set exactly when they have the same arcs,
which makes the pair of arcs a canonical representation of the underlying sets in $\mathrm{UR}\times\mathrm{SR}.$

Now we've achieved our goal of canonicalizing elements of $\mathrm{UR}\times\mathrm{SR}$ by using these arcs.
**How much space do these arcs require?**

Well, for any width $w,$ the halves are equal-sized, so unlike with `UnsignedRange`, we store two arcs, but each arc spans only half as many values.
Recalling the formula from the `UnsignedRange` size calculation, and including a value for the empty arc,
each half admits $\frac{2^{w-1}(2^{w-1}+1)}{2}+1$ arcs.
Giving the number of distinct underlying sets represented by $\mathrm{UR}\times\mathrm{SR}$:
$$
\left(\frac{2^{w-1}(2^{w-1}+1)}{2} + 1\right)^2
$$
**The bad news:** This grows like $2^{4w}.$
So, any encoding of a fully reduced $\mathrm{UR}\times\mathrm{SR}$ still requires 4 $w$-width integers to store,
twice the 2 $w$-width integers used by LLVM to store a `ConstantRange`.

**The good news:** The same argument hands us a free reduction operator: the arcs are the reduced form, and computing them takes a constant number of comparisons.
Writing a correct reduction operator is notorious, and writing a fast one is not possible in general for arbitrary domains.
This counting argument above also tells us that a more clever encoding could only ever save a small constant number of bits,
so there's no need to waste time searching for a more efficient representation.
I actually came up with this proof after wasting several hours on a road trip trying to find an asymptotically more efficient way to store $\mathrm{UR}\times\mathrm{SR},$
and I'd like to save any readers from the same pain.

## Conclusion

Compilers are big, jumbled messes of tradeoffs.
In this case, there's a tradeoff between analysis precision, using an actual lattice, and the memory requirements of your domain. 
Each of these choices comes with second-order effects: 
more storage-intensive domains are likely to increase compile times,
while a non-lattice domain requires additional engineering work to ensure that the analysis is sound and terminates,
and a less precise domain means fewer optimizations fire.

Here's where each domain lands:

| Domain                         | Lattice? | Abstract values    | Represents                                                   |
|--------------------------------|----------|--------------------|--------------------------------------------------------------|
| `ConstantRange`                | no       | $\approx 2^{2w}$   | _any_ contiguous region on a number circle                   |
| `UnsignedRange`, `SignedRange` | yes      | $\approx 2^{2w-1}$ | one contiguous region that doesn't cross the chosen boundary |
| $\mathrm{UR}\times\mathrm{SR}$ | yes      | $\approx 2^{4w-6}$ | one arc for each half of the circle                          |

Let's unpack that last column using our two examples from earlier.
`ConstantRange` can represent the "every value except $7$" set with a single range, $[8, 7),$ while $\mathrm{UR}\times\mathrm{SR}$ has to give up and return $\top.$
On the other hand, $\mathrm{UR}\times\mathrm{SR}$ represents the set $\{0, 128\}$ exactly, while `ConstantRange` is stuck with a range of 129 elements.
It turns out that these two examples are representative of the only way in which these domains differ.
Any arc that crosses at most one of our cuts can be represented by both domains, but only `ConstantRange` can represent an arc that crosses both cuts, and only $\mathrm{UR}\times\mathrm{SR}$ can represent a set made from one arc on each half of the circle.
So neither domain is a superset of the other, and the extra storage that $\mathrm{UR}\times\mathrm{SR}$ requires buys us a different collection of sets rather than a larger one.

Finally, here are the interval domains I found in other compilers.
There are lots of different ways to represent these values, so if I've misclassified something or I'm missing your favorite compiler, send email, and I'll update the list.

| Compiler         | Interval Domain                                                                                                                                          |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| PyPy tracing JIT | `SignedRange` only[^8]                                      [src](https://github.com/pypy/pypy/blob/main/rpython/jit/metainterp/optimizeopt/intutils.py) |
| SpiderMonkey Ion | `SignedRange` only[^9]                                      [src](https://github.com/mozilla/gecko-dev/blob/master/js/src/jit/RangeAnalysis.h)           |
| LLVM             | `ConstantRange`                                             [src](https://github.com/llvm/llvm-project/blob/main/llvm/lib/IR/ConstantRange.cpp)          |
| V8 Turboshaft    | `ConstantRange`                                             [src](https://github.com/v8/v8/blob/main/src/compiler/turboshaft/types.h)                    |
| Go               | Unreduced product of `UnsignedRange`$\times$`SignedRange`   [src](https://github.com/golang/go/blob/master/src/cmd/compile/internal/ssa/prove.go)        |
| Java HotSpot     | Reduced product of `UnsignedRange`$\times$`SignedRange`[^8] [src](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/opto/type.hpp)         |

If you'll allow me to speculate:
I would say that since PyPy, V8, and SpiderMonkey are all JITs, with strict compilation time budgets, they opt for the domains which are cheaper to store.
There may be an interesting comparison to be made between V8 and SpiderMonkey, both of which are JavaScript JITs targeting the same platforms, yet each uses a different domain.
I'm the most familiar with LLVM and talked earlier about some of the benefits they may see from the cyclicity of `ConstantRange`.
Go and HotSpot, on the other hand, may place more value on using a lattice.
Perhaps they can tolerate the additional storage and compile-time costs, so they opt for the more expensive but ultimately more expressive domain.

---

[^1]: I'm being purposefully ambiguous about the definitions of $>,$ $\mathit{max\_val},$ and $\mathit{min\_val}$ here, since choosing a signed or unsigned interpretation won't change the represented set (see [Interval Analysis and Machine Arithmetic: Why Signedness Ignorance Is Bliss](https://dl.acm.org/doi/10.1145/2651360)).
[^2]: To my knowledge, it was first defined in [Bitwidth Analysis With Application to Silicon Compilation](https://dl.acm.org/doi/10.1145/358438.349317).
[^3]: `add`, `sub`, and `mul` are exactly the ring operations of $\mathbb{Z} / 2^w \mathbb{Z},$ which is way cool in my book.
[^4]: LLVM's SCEV analysis came slightly later than `ConstantRange`. Was the `nw` flag designed specifically with this `ConstantRange` quirk in mind? If anyone knows, please send email!
[^5]: It is actually possible to construct $2^w$ different interval-based lattices, one for each possible boundary point on the number circle.
[^6]: Case in point:
We used the `UnsignedRange` and `SignedRange` domains to synthesize abstract transfer functions over intervals in our [POPL 2026 paper](https://users.cs.utah.edu/~regehr/papers/popl26.pdf).
Although we used LLVM as our evaluation environment, these domains made it much easier to formally verify the correctness of the implementation.
[^7]: Formally defined: $\rho(u, s) = (\alpha_\text{UR} (\gamma_\text{UR} (u) \cap \gamma_\text{SR} (s)), \alpha_\text{SR} (\gamma_\text{UR} (u) \cap \gamma_\text{SR} (s))).$
[^8]: PyPy and HotSpot both store the reduction between this range and KnownBits as well, very impressive!
[^9]: SpiderMonkey additionally includes the endpoints $-\infty$ and $\infty.$ I suspect this is to account for JS's floating-point math.
